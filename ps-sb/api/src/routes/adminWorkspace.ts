import { Router, type Request, type Response } from "express";
import { fromDatabasePromotionDiscountType, toDatabasePromotionDiscountType } from "../lib/promotionDiscount.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { getSalonSettings, validateSalonSettings } from "../services/systemSettings.js";
import { getAuthenticatedUser } from "./auth.js";

export const adminWorkspaceRouter = Router();

const PAYMENT_METHODS = ["cash", "card", "ewallet", "other"] as const;
const BACKUP_FORMAT = "lynq-admin-backup-v1";

async function requireAdmin(req: Request, res: Response) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ success: false, message: "You must be signed in." });
    return null;
  }

  const supabase = getSupabaseAdmin();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("account_role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!profile?.is_active || profile.account_role !== "admin") {
    res.status(403).json({ success: false, message: "Administrator access is required." });
    return null;
  }

  return { user, supabase };
}

function stringField(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function writeAuditLog(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  summary: string,
  metadata: Record<string, unknown> = {},
) {
  const { error } = await supabase.from("audit_logs").insert({
    actor_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata: { ...metadata, summary },
  });
  if (error) throw error;
}

adminWorkspaceRouter.get("/settings", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    res.json({ success: true, settings: await getSalonSettings() });
  } catch (error) {
    console.error("Salon settings load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load salon settings." });
  }
});

adminWorkspaceRouter.put("/settings", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const settings = validateSalonSettings(req.body?.settings);
    if (!settings) {
      res.status(400).json({ success: false, message: "Enter valid salon details, queue address, theme, and business hours." });
      return;
    }
    const { error } = await access.supabase
      .from("system_settings")
      .upsert({ key: "salon_settings", value: settings, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw error;
    await writeAuditLog(
      access.supabase,
      access.user.id,
      "salon.settings_updated",
      "salon_settings",
      null,
      "Updated salon settings and branding.",
      { themeColor: settings.themeColor, queueUrlUpdated: Boolean(settings.queueUrl) },
    );
    res.json({ success: true, settings });
  } catch (error) {
    console.error("Salon settings save failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to save salon settings." });
  }
});

adminWorkspaceRouter.get("/audit-logs", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const { data: logs, error } = await access.supabase
      .from("audit_logs")
      .select("id, actor_id, action, entity_type, entity_id, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;

    const actorIds = [...new Set((logs ?? []).map((log) => log.actor_id))];
    const { data: profiles, error: profilesError } = actorIds.length
      ? await access.supabase.from("profiles").select("id, full_name, username").in("id", actorIds)
      : { data: [], error: null };
    if (profilesError) throw profilesError;
    const actorNames = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name || profile.username]));
    res.json({
      success: true,
      logs: (logs ?? []).map((log) => ({
        ...log,
        summary: typeof log.metadata?.summary === "string" ? log.metadata.summary : log.action,
        actor_name: actorNames.get(log.actor_id) ?? "Admin",
      })),
    });
  } catch (error) {
    console.error("Admin audit log load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load audit logs." });
  }
});

adminWorkspaceRouter.get("/service-history", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const { data: entries, error } = await access.supabase
      .from("queue_entries")
      .select("id, ticket_number, customer_name, contact_number, status, created_at, queue_entry_services ( id, status, service_stage, staff_update, staff_updated_at, started_at, service_started_at, completed_at, services ( name ) )")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw error;
    res.json({
      success: true,
      sessions: (entries ?? []).map((entry) => ({
        id: entry.id,
        ticket_number: entry.ticket_number,
        customer_name: entry.customer_name,
        contact_number: entry.contact_number,
        status: entry.status,
        created_at: entry.created_at,
        services: (entry.queue_entry_services ?? []).map((item) => {
          const service = Array.isArray(item.services) ? item.services[0] : item.services;
          return {
            id: item.id,
            name: service?.name ?? "Service",
            status: item.status,
            service_stage: item.service_stage,
            staff_update: item.staff_update,
            staff_updated_at: item.staff_updated_at,
            started_at: item.service_started_at ?? item.started_at,
            completed_at: item.completed_at,
          };
        }),
      })),
    });
  } catch (error) {
    console.error("Service history load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load service history." });
  }
});

adminWorkspaceRouter.get("/customers", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const search = stringField(req.query.search, 100);
    let query = access.supabase
      .from("customer_records")
      .select("id, contact_number, display_name, is_vip, updated_at, customer_tag_assignments ( tag_id, customer_tags ( id, name, color ) )")
      .order("display_name", { ascending: true })
      .limit(500);
    if (search) query = query.or(`display_name.ilike.%${search}%,contact_number.ilike.%${search}%`);
    const [{ data: customers, error }, { data: tags, error: tagsError }] = await Promise.all([
      query,
      access.supabase.from("customer_tags").select("id, name, color").order("name"),
    ]);
    if (error) throw error;
    if (tagsError) throw tagsError;
    res.json({ success: true, customers, tags });
  } catch (error) {
    console.error("Customer tags load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load customers." });
  }
});

adminWorkspaceRouter.post("/customers", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const displayName = stringField(req.body?.displayName, 100);
    const contactNumber = stringField(req.body?.contactNumber, 16);
    if (!displayName || !/^09\d{9}$/.test(contactNumber)) {
      res.status(400).json({ success: false, message: "Enter a customer name and valid Philippine mobile number." });
      return;
    }
    const { data, error } = await access.supabase
      .from("customer_records")
      .insert({ display_name: displayName, contact_number: contactNumber, is_vip: req.body?.isVip === true })
      .select("id, contact_number, display_name, is_vip, updated_at")
      .single();
    if (error?.code === "23505") {
      res.status(409).json({ success: false, message: "A customer with this mobile number already exists." });
      return;
    }
    if (error) throw error;
    await writeAuditLog(access.supabase, access.user.id, "customer.created", "customer", data.id, `Added customer ${data.display_name}.`);
    res.status(201).json({ success: true, customer: data });
  } catch (error) {
    console.error("Customer create failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to add customer." });
  }
});

adminWorkspaceRouter.post("/customers/:customerId/vip", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    if (typeof req.body?.isVip !== "boolean") {
      res.status(400).json({ success: false, message: "Choose whether this customer is VIP." });
      return;
    }
    const { data, error } = await access.supabase
      .from("customer_records")
      .update({ is_vip: req.body.isVip, updated_at: new Date().toISOString() })
      .eq("id", req.params.customerId)
      .select("id, is_vip")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      res.status(404).json({ success: false, message: "Customer not found." });
      return;
    }
    await writeAuditLog(access.supabase, access.user.id, "customer.vip_updated", "customer", data.id, `Updated VIP status for customer ${data.id}.`, { isVip: data.is_vip });
    res.json({ success: true, customer: data });
  } catch (error) {
    console.error("Customer VIP update failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to update VIP status." });
  }
});

adminWorkspaceRouter.post("/tags", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const name = stringField(req.body?.name, 50);
    const color = stringField(req.body?.color, 16) || "sage";
    if (!name || !["sage", "clay", "gold", "info"].includes(color)) {
      res.status(400).json({ success: false, message: "Enter a tag name and choose an available color." });
      return;
    }
    const { data, error } = await access.supabase
      .from("customer_tags")
      .insert({ name, color })
      .select("id, name, color")
      .single();
    if (error?.code === "23505") {
      res.status(409).json({ success: false, message: "A tag with that name already exists." });
      return;
    }
    if (error) throw error;
    await writeAuditLog(access.supabase, access.user.id, "customer_tag.created", "customer_tag", data.id, `Created customer tag ${data.name}.`);
    res.status(201).json({ success: true, tag: data });
  } catch (error) {
    console.error("Customer tag create failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to create tag." });
  }
});

adminWorkspaceRouter.post("/customers/:customerId/tags/:tagId", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const { error } = await access.supabase.from("customer_tag_assignments").upsert({
      customer_id: req.params.customerId,
      tag_id: req.params.tagId,
    });
    if (error) throw error;
    await writeAuditLog(access.supabase, access.user.id, "customer_tag.assigned", "customer_tag_assignment", null, `Assigned tag ${req.params.tagId} to customer ${req.params.customerId}.`, { customerId: req.params.customerId, tagId: req.params.tagId });
    res.json({ success: true });
  } catch (error) {
    console.error("Customer tag assignment failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to assign tag." });
  }
});

adminWorkspaceRouter.delete("/customers/:customerId/tags/:tagId", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const { error } = await access.supabase
      .from("customer_tag_assignments")
      .delete()
      .eq("customer_id", req.params.customerId)
      .eq("tag_id", req.params.tagId);
    if (error) throw error;
    await writeAuditLog(access.supabase, access.user.id, "customer_tag.removed", "customer_tag_assignment", null, `Removed tag ${req.params.tagId} from customer ${req.params.customerId}.`, { customerId: req.params.customerId, tagId: req.params.tagId });
    res.json({ success: true });
  } catch (error) {
    console.error("Customer tag removal failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to remove tag." });
  }
});

adminWorkspaceRouter.delete("/tags/:tagId", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const { error } = await access.supabase.from("customer_tags").delete().eq("id", req.params.tagId);
    if (error) throw error;
    await writeAuditLog(access.supabase, access.user.id, "customer_tag.deleted", "customer_tag", req.params.tagId, `Deleted customer tag ${req.params.tagId}.`);
    res.json({ success: true });
  } catch (error) {
    console.error("Customer tag delete failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to delete tag." });
  }
});

adminWorkspaceRouter.get("/promotions", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const { data, error } = await access.supabase
      .from("promotions")
      .select("id, title:name, description, discount_type, discount_value, starts_at:start_date, ends_at:end_date, is_active")
      .order("start_date", { ascending: false });
    if (error) throw error;
    res.json({
      success: true,
      promotions: data.map((promotion) => ({
        ...promotion,
        discount_type: fromDatabasePromotionDiscountType(promotion.discount_type),
      })),
    });
  } catch (error) {
    console.error("Promotions load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load promotions." });
  }
});

adminWorkspaceRouter.post("/promotions", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const title = stringField(req.body?.title, 100);
    const description = stringField(req.body?.description, 500);
    const discountType = req.body?.discountType;
    const discountValue = Number(req.body?.discountValue);
    const startsAt = typeof req.body?.startsAt === "string" ? new Date(req.body.startsAt) : null;
    const endsAt = typeof req.body?.endsAt === "string" ? new Date(req.body.endsAt) : null;
    if (!title || !["percent", "fixed"].includes(discountType)
      || !Number.isFinite(discountValue) || discountValue <= 0
      || (discountType === "percent" && discountValue > 100)
      || !startsAt || Number.isNaN(startsAt.getTime())
      || !endsAt || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      res.status(400).json({ success: false, message: "Enter a valid title, discount, and start/end date range." });
      return;
    }
    const { data, error } = await access.supabase
      .from("promotions")
      .insert({
        name: title,
        description: description || null,
        discount_type: toDatabasePromotionDiscountType(discountType),
        discount_value: discountValue,
        start_date: startsAt.toISOString(),
        end_date: endsAt.toISOString(),
      })
      .select("id, title:name, description, discount_type, discount_value, starts_at:start_date, ends_at:end_date, is_active")
      .single();
    if (error) throw error;
    await writeAuditLog(access.supabase, access.user.id, "promotion.created", "promotion", data.id, `Created promotion ${data.title}.`, { discountType: data.discount_type, discountValue: data.discount_value });
    res.status(201).json({
      success: true,
      promotion: { ...data, discount_type: fromDatabasePromotionDiscountType(data.discount_type) },
    });
  } catch (error) {
    console.error("Promotion create failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to create promotion." });
  }
});

adminWorkspaceRouter.patch("/promotions/:promotionId", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;

    const hasPromotionFields = ["title", "description", "discountType", "discountValue", "startsAt", "endsAt"]
      .some((field) => Object.hasOwn(req.body ?? {}, field));
    if (!hasPromotionFields && typeof req.body?.isActive !== "boolean") {
      res.status(400).json({ success: false, message: "Promotion details or active status are required." });
      return;
    }

    let update: Record<string, unknown>;
    let action: string;
    let summary: (promotion: { id: string; title: string; is_active: boolean }) => string;
    let metadata: Record<string, unknown>;

    if (!hasPromotionFields) {
      update = { is_active: req.body.isActive };
      action = "promotion.status_updated";
      summary = (promotion) => `${promotion.is_active ? "Activated" : "Deactivated"} promotion ${promotion.title}.`;
      metadata = { isActive: req.body.isActive };
    } else {
      const title = stringField(req.body?.title, 100);
      const description = stringField(req.body?.description, 500);
      const discountType = req.body?.discountType;
      const discountValue = Number(req.body?.discountValue);
      const startsAt = typeof req.body?.startsAt === "string" ? new Date(req.body.startsAt) : null;
      const endsAt = typeof req.body?.endsAt === "string" ? new Date(req.body.endsAt) : null;
      if (!title || !["percent", "fixed"].includes(discountType)
        || !Number.isFinite(discountValue) || discountValue <= 0
        || (discountType === "percent" && discountValue > 100)
        || !startsAt || Number.isNaN(startsAt.getTime())
        || !endsAt || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
        res.status(400).json({ success: false, message: "Enter a valid title, discount, and start/end date range." });
        return;
      }
      update = {
        name: title,
        description: description || null,
        discount_type: toDatabasePromotionDiscountType(discountType),
        discount_value: discountValue,
        start_date: startsAt.toISOString(),
        end_date: endsAt.toISOString(),
      };
      action = "promotion.updated";
      summary = (promotion) => `Updated promotion ${promotion.title}.`;
      metadata = { discountType, discountValue };
    }

    const { data, error } = await access.supabase
      .from("promotions")
      .update(update)
      .eq("id", req.params.promotionId)
      .select("id, title:name, description, discount_type, discount_value, starts_at:start_date, ends_at:end_date, is_active")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      res.status(404).json({ success: false, message: "Promotion not found." });
      return;
    }
    await writeAuditLog(access.supabase, access.user.id, action, "promotion", data.id, summary(data), metadata);
    res.json({
      success: true,
      promotion: { ...data, discount_type: fromDatabasePromotionDiscountType(data.discount_type) },
    });
  } catch (error) {
    console.error("Promotion update failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to update promotion." });
  }
});

adminWorkspaceRouter.get("/transactions", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const from = typeof req.query.from === "string" ? new Date(req.query.from) : null;
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : null;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime())) || (from && to && to < from)) {
      res.status(400).json({ success: false, message: "Choose a valid transaction date range." });
      return;
    }
    let query = access.supabase
      .from("pos_transactions")
      .select("*, pos_transaction_items (*)")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (from) query = query.gte("created_at", from.toISOString());
    if (to) query = query.lte("created_at", to.toISOString());
    const { data, error } = await query;
    if (error) throw error;
    res.json({ success: true, transactions: data });
  } catch (error) {
    console.error("Transactions load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load transactions." });
  }
});

adminWorkspaceRouter.get("/checkout-candidates", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const [{ data: entries, error }, { data: transactions, error: transactionsError }] = await Promise.all([
      access.supabase
        .from("queue_entries")
        .select("id, ticket_number, customer_name, contact_number, queue_entry_services ( id, status, price, services ( name ) )")
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(500),
      access.supabase.from("pos_transactions").select("queue_entry_id"),
    ]);
    if (error) throw error;
    if (transactionsError) throw transactionsError;
    const checkedOut = new Set((transactions ?? []).map((transaction) => transaction.queue_entry_id));
    const candidates = (entries ?? [])
      .filter((entry) =>
        !checkedOut.has(entry.id)
        && (entry.queue_entry_services ?? []).length > 0
        && entry.queue_entry_services.every((item) => item.status === "completed")
      )
      .map((entry) => ({
        id: entry.id,
        ticketNumber: entry.ticket_number,
        customerName: entry.customer_name,
        contactNumber: entry.contact_number,
        services: (entry.queue_entry_services ?? []).map((item) => {
          const service = Array.isArray(item.services) ? item.services[0] : item.services;
          return { name: service?.name ?? "Service", price: Number(item.price) };
        }),
      }));
    res.json({ success: true, candidates });
  } catch (error) {
    console.error("Checkout ticket load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load completed tickets." });
  }
});

adminWorkspaceRouter.post("/transactions", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const queueEntryId = stringField(req.body?.queueEntryId, 64);
    const paymentMethod = req.body?.paymentMethod;
    const promotionId = typeof req.body?.promotionId === "string" ? req.body.promotionId : null;
    if (!queueEntryId || !PAYMENT_METHODS.includes(paymentMethod)) {
      res.status(400).json({ success: false, message: "Select a completed queue ticket and valid payment method." });
      return;
    }

    const { data: entry, error: entryError } = await access.supabase
      .from("queue_entries")
      .select("id, ticket_number, customer_name, contact_number, status, queue_entry_services ( id, status, price, services ( name ) )")
      .eq("id", queueEntryId)
      .maybeSingle();
    if (entryError) throw entryError;
    if (!entry) {
      res.status(404).json({ success: false, message: "Queue ticket not found." });
      return;
    }
    if (entry.status !== "completed"
      || !(entry.queue_entry_services ?? []).length
      || !(entry.queue_entry_services ?? []).every((item) => item.status === "completed")) {
      res.status(409).json({ success: false, message: "Only fully completed queue visits can be checked out." });
      return;
    }

    const existing = await access.supabase.from("pos_transactions").select("id").eq("queue_entry_id", queueEntryId).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
      res.status(409).json({ success: false, message: "This ticket has already been checked out." });
      return;
    }

    const subtotal = (entry.queue_entry_services ?? []).reduce((sum, item) => sum + Number(item.price || 0), 0);
    let discountAmount = 0;
    if (promotionId) {
      const { data: promotion, error: promotionError } = await access.supabase
        .from("promotions")
        .select("discount_type, discount_value")
        .eq("id", promotionId)
        .eq("is_active", true)
        .lte("start_date", new Date().toISOString())
        .gte("end_date", new Date().toISOString())
        .maybeSingle();
      if (promotionError) throw promotionError;
      if (!promotion) {
        res.status(400).json({ success: false, message: "That promotion is not currently active." });
        return;
      }
      discountAmount = promotion.discount_type === "percentage"
        ? subtotal * Number(promotion.discount_value) / 100
        : Number(promotion.discount_value);
      discountAmount = Math.min(subtotal, Math.round(discountAmount * 100) / 100);
    }

    const transaction = {
      queue_entry_id: entry.id,
      ticket_number: entry.ticket_number,
      customer_name: entry.customer_name,
      contact_number: entry.contact_number,
      subtotal,
      discount_amount: discountAmount,
      total_amount: subtotal - discountAmount,
      payment_method: paymentMethod,
    };
    const items = (entry.queue_entry_services ?? []).map((item) => {
      const service = Array.isArray(item.services) ? item.services[0] : item.services;
      const price = Number(item.price || 0);
      return {
        service_name: service?.name ?? "Service",
        quantity: 1,
        unit_price: price,
        line_total: price,
      };
    });
    const { data: recordedTransaction, error: transactionError } = await access.supabase.rpc(
      "record_lynq_pos_transaction",
      { p_transaction: transaction, p_items: items }
    );
    if (transactionError?.code === "23505") {
      res.status(409).json({ success: false, message: "This ticket has already been checked out." });
      return;
    }
    if (transactionError) throw transactionError;
    await writeAuditLog(access.supabase, access.user.id, "pos_transaction.recorded", "pos_transaction", recordedTransaction.id, `Recorded payment for ticket #${entry.ticket_number}.`, { ticketNumber: entry.ticket_number, totalAmount: transaction.total_amount, paymentMethod });
    res.status(201).json({ success: true, transaction: recordedTransaction });
  } catch (error) {
    console.error("POS checkout failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to complete checkout." });
  }
});

adminWorkspaceRouter.get("/reports", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const from = typeof req.query.from === "string" ? new Date(req.query.from) : new Date(Date.now() - 30 * 86400000);
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : new Date();
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
      res.status(400).json({ success: false, message: "Choose a valid report date range." });
      return;
    }
    const [{ data: transactions, error: transactionsError }, { data: visits, error: visitsError }] = await Promise.all([
      access.supabase.from("pos_transactions")
        .select("id, total_amount, discount_amount, payment_method, created_at")
        .eq("status", "paid")
        .gte("created_at", from.toISOString())
        .lt("created_at", to.toISOString())
        .order("created_at", { ascending: true })
        .limit(10000),
      access.supabase.from("queue_entries")
        .select("id, status, arrival_type, created_at")
        .gte("created_at", from.toISOString())
        .lt("created_at", to.toISOString())
        .limit(10000),
    ]);
    if (transactionsError) throw transactionsError;
    if (visitsError) throw visitsError;
    const paidTransactions = transactions ?? [];
    const byMethod = new Map<string, number>();
    for (const transaction of paidTransactions) {
      byMethod.set(transaction.payment_method, (byMethod.get(transaction.payment_method) ?? 0) + Number(transaction.total_amount));
    }
    res.json({
      success: true,
      report: {
        from: from.toISOString(),
        to: to.toISOString(),
        visits: visits?.length ?? 0,
        completed: visits?.filter((visit) => visit.status === "completed").length ?? 0,
        appointments: visits?.filter((visit) => visit.arrival_type === "appointment").length ?? 0,
        transactions: paidTransactions.length,
        revenue: paidTransactions.reduce((sum, transaction) => sum + Number(transaction.total_amount), 0),
        discounts: paidTransactions.reduce((sum, transaction) => sum + Number(transaction.discount_amount), 0),
        revenueByPaymentMethod: [...byMethod.entries()].map(([paymentMethod, amount]) => ({ paymentMethod, amount })),
      },
    });
  } catch (error) {
    console.error("Admin report load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load report." });
  }
});

adminWorkspaceRouter.get("/backup", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const tables = [
      "customer_records",
      "customer_tags",
      "customer_tag_assignments",
      "promotions",
      "pos_transactions",
      "pos_transaction_items",
    ] as const;
    const responses = await Promise.all(tables.map((table) =>
      access.supabase.from(table).select("*").range(0, 49999)
    ));
    const failed = responses.find((response) => response.error);
    if (failed?.error) throw failed.error;
    const payload = Object.fromEntries(tables.map((table, index) => [table, responses[index].data ?? []]));
    const recordCounts = Object.fromEntries(tables.map((table) => [table, (payload[table] as unknown[]).length]));
    const { error: auditError } = await access.supabase.from("admin_backup_log").insert({
      action: "export",
      created_by: access.user.id,
      record_counts: recordCounts,
    });
    if (auditError) throw auditError;
    await writeAuditLog(access.supabase, access.user.id, "backup.exported", "admin_backup", null, "Exported an admin data backup.", recordCounts);
    res.json({
      success: true,
      backup: { format: BACKUP_FORMAT, exportedAt: new Date().toISOString(), recordCounts, ...payload },
    });
  } catch (error) {
    console.error("Admin data export failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to export admin data." });
  }
});

adminWorkspaceRouter.get("/backup/history", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const { data, error } = await access.supabase
      .from("admin_backup_log")
      .select("id, action, record_counts, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    res.json({ success: true, history: data });
  } catch (error) {
    console.error("Backup history load failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to load backup history." });
  }
});

adminWorkspaceRouter.post("/backup/restore", async (req, res) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    const payload = req.body?.backup;
    if (!payload || payload.format !== BACKUP_FORMAT || Buffer.byteLength(JSON.stringify(payload), "utf8") > 20_000_000) {
      res.status(400).json({ success: false, message: "Select a valid LynQ admin-data backup under 20 MB." });
      return;
    }
    const { data, error } = await access.supabase.rpc("restore_lynq_admin_backup", { p_payload: payload });
    if (error) throw error;
    const { error: auditError } = await access.supabase.from("admin_backup_log").insert({
      action: "restore",
      created_by: access.user.id,
      record_counts: data,
    });
    if (auditError) throw auditError;
    await writeAuditLog(access.supabase, access.user.id, "backup.restored", "admin_backup", null, "Restored an admin data backup.", data);
    res.json({ success: true, recordCounts: data });
  } catch (error) {
    console.error("Admin data restore failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to restore admin data." });
  }
});
