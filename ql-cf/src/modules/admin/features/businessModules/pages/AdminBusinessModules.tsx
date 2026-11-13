import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Download, Ellipsis, HardDriveDownload, ReceiptText, RotateCcw, Scissors, Sparkles, Upload } from "lucide-react";
import { apiDownload, apiRequest, apiRequestWithProgress } from "@/shared/lib/apiClient";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { PaginationControls } from "@/shared/components/PaginationControls";
import { paginateItems } from "@/shared/lib/pagination";
import { formatTicketNumber } from "@/shared/lib/ticketNumber";
import { useAuth } from "@/shared/context/useAuth";
import { DownloadFeedback, type DownloadFeedbackState } from "../../../components/DownloadFeedback";
import { PhilippinePhoneInput } from "@/shared/components/PhilippinePhoneInput";
import { useFeedback } from "@/shared/components/FeedbackContext";

type ModuleKey = "customer-tagging" | "promotions-events" | "pos-transactions" | "reports" | "backup-restore" | "audit-logs";
interface TaggedCustomer {
  id: string;
  contact_number: string;
  display_name: string;
  is_vip: boolean;
}

interface Promotion {
  id: string;
  title: string;
  description: string | null;
  discount_type: "percent" | "fixed";
  discount_value: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  image_data_url: string | null;
  eligible_service_ids: string[];
  minimum_spend: number | null;
  maximum_discount: number | null;
  usage_limit: number | null;
  redemption_count: number;
  one_per_customer: boolean;
  exclude_packages: boolean;
}

type PromotionStatus = "live" | "scheduled" | "inactive" | "ended";

function promotionStatus(promotion: Promotion, now = Date.now()): PromotionStatus {
  if (!promotion.is_active) return "inactive";
  if (now < new Date(promotion.starts_at).getTime()) return "scheduled";
  if (now > new Date(promotion.ends_at).getTime()) return "ended";
  return "live";
}

function emptyPromotionForm() {
  return {
    title: "",
    description: "",
    discountType: "percent" as "percent" | "fixed",
    discountValue: "10",
    startsAt: "",
    endsAt: "",
    imageDataUrl: null as string | null,
    limitToServices: false,
    serviceIds: [] as string[],
    minimumSpend: "",
    maximumDiscount: "",
    usageLimit: "",
    onePerCustomer: false,
    excludePackages: false,
  };
}

interface ServicePackage {
  id: string;
  title: string;
  description: string | null;
  package_type: "service_bundle" | "prepaid_sessions";
  price: number;
  sessions_count: number;
  is_active: boolean;
  image_data_url: string | null;
  service_package_items: {
    service_id: string;
    quantity: number;
    services: { id: string; name: string } | null;
  }[];
}

interface PackageService {
  id: string;
  name: string;
  category: string | null;
  price: number;
  is_visible: boolean;
  is_available: boolean;
}

function ServiceCategoryPicker({
  services,
  selectedServiceIds,
  onChange,
  searchLabel,
}: {
  services: PackageService[];
  selectedServiceIds: string[];
  onChange: (serviceIds: string[]) => void;
  searchLabel: string;
}) {
  const [activeCategory, setActiveCategory] = useState("All services");
  const [search, setSearch] = useState("");
  const availableServices = services.filter((service) => service.is_visible && service.is_available);
  const categories = [...new Set(availableServices.map((service) => service.category?.trim() || "Services"))]
    .sort((a, b) => a.localeCompare(b));
  const query = search.trim().toLowerCase();
  const visibleServices = availableServices.filter((service) => {
    const category = service.category?.trim() || "Services";
    return (activeCategory === "All services" || category === activeCategory)
      && (!query || `${service.name} ${category}`.toLowerCase().includes(query));
  });

  function toggleService(serviceId: string, selected: boolean) {
    onChange(selected
      ? [...selectedServiceIds, serviceId]
      : selectedServiceIds.filter((id) => id !== serviceId));
  }

  return (
    <div>
      <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search services" aria-label={searchLabel} className="dashboard-filter-control w-full text-ink" />
      <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Service categories">
        {["All services", ...categories].map((category) => (
          <button key={category} type="button" aria-pressed={activeCategory === category} onClick={() => setActiveCategory(category)} className={`min-h-8 rounded-full px-3 text-[10px] font-semibold ${activeCategory === category ? "bg-ink text-white" : "border border-mist bg-white text-ink/60 hover:border-sage"}`}>
            {category}
          </button>
        ))}
      </div>
      <div className="mt-2 max-h-36 space-y-2 overflow-y-auto rounded-lg border border-mist p-2">
        {visibleServices.map((service) => (
          <label key={service.id} className="flex items-center gap-2 text-xs text-ink/70">
            <input type="checkbox" checked={selectedServiceIds.includes(service.id)} onChange={(event) => toggleService(service.id, event.target.checked)} />
            <span className="min-w-0 flex-1">{service.name}</span><span>₱{Number(service.price).toFixed(2)}</span>
          </label>
        ))}
        {visibleServices.length === 0 && <p className="text-[10px] text-ink/45">{query ? "No available services match." : "No available services in this category."}</p>}
      </div>
    </div>
  );
}

interface BannerImage {
  dataUrl: string;
  width: number;
  height: number;
}

interface CheckoutCandidate {
  id: string;
  ticketNumber: number;
  customerName: string;
  contactNumber: string | null;
  promotionId: string | null;
  serviceIds: string[];
  isPackage: boolean;
  services: { name: string; price: number }[];
}

interface Transaction {
  id: string;
  ticket_number: number;
  customer_name: string;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  payment_method: string;
  status: string;
  created_at: string;
  adjustments: PosAdjustment[];
}

interface PosAdjustment {
  id: string;
  adjustment_type: "refund" | "void";
  amount: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  requested_by: string;
}

type PosPasswordAction =
  | {
    type: "request";
    transaction: Transaction;
    adjustmentType: "refund" | "void";
    amount: number;
    reason: string;
  }
  | { type: "approve" | "reject"; adjustmentId: string };

interface Report {
  reportType: ReportType;
  from: string;
  to: string;
  visits: number;
  completed: number;
  noShowRate: number;
  appointments: number;
  transactions: number;
  revenue: number;
  discounts: number;
  revenueByPaymentMethod: { paymentMethod: string; amount: number }[];
  rows: Record<string, string | number | null>[];
}

type ReportType = "overview" | "revenue" | "services" | "visits" | "service-log";
type ReportDateRange = "last7" | "last30" | "last90" | "thisMonth" | "custom";
type ReportFileType = "pdf" | "excel" | "csv";

const REPORT_TYPES: { id: ReportType; label: string; description: string }[] = [
  { id: "overview", label: "Salon overview", description: "Key activity, revenue, and payment totals." },
  { id: "revenue", label: "Revenue", description: "Daily sales, discounts, and transaction counts." },
  { id: "services", label: "Services", description: "Bookings and completions by service." },
  { id: "visits", label: "Visits", description: "Daily visit volume, appointments, and outcomes." },
  { id: "service-log", label: "Service & transaction log", description: "Visit-level services, completion times, prices, and checkout details." },
];

interface BackupHistory {
  id: string;
  action: "export" | "restore";
  record_counts: Record<string, number>;
  created_at: string;
}

interface ScheduledBackupFile {
  fileName: string;
  cadence: "daily" | "weekly" | "monthly" | "yearly";
  size: number;
  createdAt: string;
}

interface ScheduledBackupFilesResult {
  backups: ScheduledBackupFile[];
  available: boolean;
  message: string | null;
}

interface ScheduledBackupStatus {
  enabled: boolean;
  directoryConfigured: boolean;
  time: string;
  timeZone: string;
  retention: {
    daily: number;
    weekly: number;
    monthly: number;
    yearly: number;
  };
  lastRunAt: string | null;
  lastRunStatus: "success" | "skipped" | "error" | null;
  lastRunMessage: string | null;
  lastFileName: string | null;
}

interface BackupExportPayload extends Record<string, unknown> {
  recordCounts?: Record<string, number>;
}

interface BackupRestorePreview {
  exportedAt: string | null;
  recordCounts: Record<string, number>;
}

interface OperationalResetPreview {
  staff: { username: string; fullName: string }[];
  counts: Record<string, number>;
  exportedAt: string | null;
  hasRecentBackup: boolean;
  confirmationPhrase: string;
  preserved: string[];
}

const BACKUP_SUMMARY_GROUPS = [
  {
    label: "Customer profiles & tags",
    tables: ["customer_accounts", "customer_records", "customer_tags", "customer_tag_assignments"],
  },
  {
    label: "Queue & notifications",
    tables: ["queue_entries", "queue_entry_services", "queue_parties", "customer_service_seats", "queue_sms_outbox"],
  },
  {
    label: "Staff & salon setup",
    tables: ["profiles", "staff_availability", "staff_rebalance_requests", "stations", "device_heartbeats", "system_settings"],
  },
  {
    label: "Services, sales & reports",
    tables: ["services", "service_packages", "service_package_items", "customer_package_balances", "promotions", "promotion_redemptions", "pos_transactions", "pos_transaction_items", "pos_transaction_adjustments", "service_history", "forecast_events", "forecast_logs", "mlr_models", "audit_logs", "admin_backup_log"],
  },
] as const;

interface AuditLog {
  id: string;
  actor_name: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  metadata?: Record<string, unknown> | null;
  summary: string;
  created_at: string;
  status: string;
}

const moduleTitles: Record<ModuleKey, string> = {
  "customer-tagging": "VIP & Customer Tags",
  "promotions-events": "Promotions",
  "pos-transactions": "POS & Transactions",
  reports: "Reports",
  "backup-restore": "Backup & Restore",
  "audit-logs": "Audit Logs",
};

const BANNER_WIDTH = 1200;
const BANNER_HEIGHT = 400;
const MAX_BANNER_BYTES = 500_000;

async function prepareBannerImage(file: File): Promise<BannerImage> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }
  if (file.size > 10_000_000) {
    throw new Error("Choose an image smaller than 10 MB.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = BANNER_WIDTH;
    canvas.height = BANNER_HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to prepare the banner image in this browser.");

    const scale = Math.max(BANNER_WIDTH / image.width, BANNER_HEIGHT / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, BANNER_WIDTH, BANNER_HEIGHT);
    context.drawImage(image, (BANNER_WIDTH - width) / 2, (BANNER_HEIGHT - height) / 2, width, height);

    for (const quality of [0.85, 0.75, 0.65, 0.55, 0.45]) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      const encoded = dataUrl.slice(dataUrl.indexOf(",") + 1);
      const size = Math.floor(encoded.length * 3 / 4);
      if (size <= MAX_BANNER_BYTES) {
        return { dataUrl, width: BANNER_WIDTH, height: BANNER_HEIGHT };
      }
    }
    throw new Error("This image could not be compressed enough. Choose a simpler image.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function localDate(date: Date) {
  const timezoneOffset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

function localDateTime(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function formatAuditValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value) ?? String(value);
}

function downloadJson(filename: string, data: unknown) {
  const file = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function AdminBusinessModules({
  module,
  showPaymentHistory = false,
}: {
  module: ModuleKey;
  showPaymentHistory?: boolean;
}) {
  const { confirm, notify } = useFeedback();
  const { currentUser } = useAuth();
  const isReceptionist = currentUser?.accountRole === "staff" && currentUser.staffRole === "receptionist";
  const canReviewPosAdjustments = currentUser?.accountRole === "admin";
  const [isLoading, setIsLoading] = useState(module !== "reports");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [downloadState, setDownloadState] = useState<DownloadFeedbackState>({ status: "idle" });
  const [customers, setCustomers] = useState<TaggedCustomer[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerPage, setCustomerPage] = useState(1);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerContact, setNewCustomerContact] = useState("");
  const [newCustomerIsVip, setNewCustomerIsVip] = useState(false);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [packageServices, setPackageServices] = useState<PackageService[]>([]);
  const [promotionSection, setPromotionSection] = useState<"offers" | "packages">("offers");
  const [promotionStatusFilter, setPromotionStatusFilter] = useState<"all" | "live" | "scheduled" | "inactive" | "ended">("all");
  const [packageStatusFilter, setPackageStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [showPromotionForm, setShowPromotionForm] = useState(false);
  const [showPackageForm, setShowPackageForm] = useState(false);
  const [promotionForm, setPromotionForm] = useState(emptyPromotionForm);
  const [packageForm, setPackageForm] = useState({
    title: "",
    description: "",
    price: "",
    serviceIds: [] as string[],
    imageDataUrl: null as string | null,
  });
  const [editingPromotionId, setEditingPromotionId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CheckoutCandidate[]>([]);
  const [showCheckoutForm, setShowCheckoutForm] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionAdjustmentsUnavailable, setTransactionAdjustmentsUnavailable] = useState(false);
  const [transactionFrom, setTransactionFrom] = useState("");
  const [transactionTo, setTransactionTo] = useState("");
  const [transactionPage, setTransactionPage] = useState(1);
  const [posPasswordAction, setPosPasswordAction] = useState<PosPasswordAction | null>(null);
  const [posAdminPassword, setPosAdminPassword] = useState("");
  const [openPosMenuId, setOpenPosMenuId] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");
  const [auditRole, setAuditRole] = useState("all");
  const [auditStatus, setAuditStatus] = useState("all");
  const [auditPage, setAuditPage] = useState(1);
  const [selectedTicket, setSelectedTicket] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [report, setReport] = useState<Report | null>(null);
  const [reportType, setReportType] = useState<ReportType>("overview");
  const [reportTypeMenuOpen, setReportTypeMenuOpen] = useState(false);
  const [reportDateRange, setReportDateRange] = useState<ReportDateRange>("last30");
  const [reportFileType, setReportFileType] = useState<ReportFileType>("pdf");
  const [reportFrom, setReportFrom] = useState(() => localDate(new Date(Date.now() - 29 * 86400000)));
  const [reportTo, setReportTo] = useState(() => localDate(new Date()));
  const [reportPage, setReportPage] = useState(1);
  const [backupHistory, setBackupHistory] = useState<BackupHistory[]>([]);
  const [backupPage, setBackupPage] = useState(1);
  const [backupFiles, setBackupFiles] = useState<ScheduledBackupFile[]>([]);
  const [backupFilesAvailable, setBackupFilesAvailable] = useState<boolean | null>(null);
  const [backupFilesMessage, setBackupFilesMessage] = useState<string | null>(null);
  const [backupSummaryCounts, setBackupSummaryCounts] = useState<Record<string, number> | null>(null);
  const [backupSchedule, setBackupSchedule] = useState<ScheduledBackupStatus | null>(null);
  const [savingBackupFile, setSavingBackupFile] = useState<string | null>(null);
  const [backupMode, setBackupMode] = useState<"download" | "restore">("download");
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [backupRestorePreview, setBackupRestorePreview] = useState<BackupRestorePreview | null>(null);
  const [showBackupConfirmation, setShowBackupConfirmation] = useState(false);
  const [showRestoreConfirmation, setShowRestoreConfirmation] = useState(false);
  const [operationalResetPreview, setOperationalResetPreview] = useState<OperationalResetPreview | null>(null);
  const [showOperationalResetConfirmation, setShowOperationalResetConfirmation] = useState(false);
  const [operationalResetConfirmation, setOperationalResetConfirmation] = useState("");
  const backupFileReadId = useRef(0);

  const loadModule = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      if (module === "customer-tagging") {
        const result = await apiRequest<{ customers: TaggedCustomer[] }>(
          `/api/admin/workspace/customers?search=${encodeURIComponent(customerSearch)}`
        );
        setErrorMessage(null);
        setCustomers(result.customers);
      } else if (module === "promotions-events") {
        const [promotionResult, packageResult, serviceResult] = await Promise.all([
          apiRequest<{ promotions: Promotion[] }>("/api/admin/workspace/promotions"),
          apiRequest<{ packages: ServicePackage[] }>("/api/admin/workspace/packages"),
          apiRequest<{ services: PackageService[] }>("/api/catalog/services"),
        ]);
        setErrorMessage(null);
        setPromotions(promotionResult.promotions);
        setPackages(packageResult.packages);
        setPackageServices(serviceResult.services);
      } else if (module === "pos-transactions") {
        const transactionParams = new URLSearchParams();
        if (showPaymentHistory && transactionFrom) transactionParams.set("from", new Date(`${transactionFrom}T00:00:00`).toISOString());
        if (showPaymentHistory && transactionTo) transactionParams.set("to", new Date(`${transactionTo}T23:59:59.999`).toISOString());
        const transactionQuery = transactionParams.size ? `?${transactionParams.toString()}` : "";
        const [candidateResult, promotionResult, transactionResult] = await Promise.all([
          apiRequest<{ candidates: CheckoutCandidate[] }>("/api/admin/workspace/checkout-candidates"),
          apiRequest<{ promotions: Promotion[] }>("/api/admin/workspace/promotions"),
          showPaymentHistory
            ? apiRequest<{ transactions: Transaction[]; adjustmentsUnavailable?: boolean }>(`/api/admin/workspace/transactions${transactionQuery}`)
            : Promise.resolve({ transactions: [], adjustmentsUnavailable: false }),
        ]);
        setErrorMessage(null);
        setCandidates(candidateResult.candidates);
        setTransactions(transactionResult.transactions);
        setTransactionAdjustmentsUnavailable(transactionResult.adjustmentsUnavailable ?? false);
        setPromotions(promotionResult.promotions);
      } else if (module === "backup-restore") {
        const [result, scheduleResult, filesResult, resetPreview] = await Promise.all([
          apiRequest<{ history: BackupHistory[] }>("/api/admin/workspace/backup/history"),
          apiRequest<{ schedule: ScheduledBackupStatus }>("/api/admin/workspace/backup/schedule-status"),
          apiRequest<ScheduledBackupFilesResult>("/api/admin/workspace/backup/files"),
          apiRequest<OperationalResetPreview>("/api/admin/workspace/operational-reset/preview"),
        ]);
        setErrorMessage(null);
        setBackupHistory(result.history);
        setBackupSchedule(scheduleResult.schedule);
        setBackupFiles(filesResult.backups);
        setBackupFilesAvailable(filesResult.available);
        setBackupFilesMessage(filesResult.message);
        setBackupSummaryCounts(result.history.find((item) => item.action === "export")?.record_counts ?? null);
        setOperationalResetPreview(resetPreview);
      } else if (module === "audit-logs") {
        const auditResult = await apiRequest<{ logs: AuditLog[] }>("/api/admin/workspace/audit-logs");
        setErrorMessage(null);
        setAuditLogs(auditResult.logs);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : `Unable to load ${moduleTitles[module].toLowerCase()}.`);
    } finally {
      setIsLoading(false);
    }
  }, [customerSearch, module, showPaymentHistory, transactionFrom, transactionTo]);

  useEffect(() => {
    // The effect calls the async loader without its synchronous loading-state update.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (module !== "reports") void loadModule(false);
  }, [loadModule, module]);

  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();
    return customers.filter((customer) =>
      !query || `${customer.display_name} ${customer.contact_number}`.toLowerCase().includes(query)
    );
  }, [customers, customerSearch]);
  const paginatedCustomers = paginateItems(filteredCustomers, customerPage, 4);
  const paginatedTransactions = paginateItems(transactions, transactionPage);

  const filteredAuditLogs = useMemo(() => {
    const query = auditSearch.trim().toLowerCase();
    return auditLogs.filter((log) => {
      const logDate = localDate(new Date(log.created_at));
      const searchableText = [
        log.actor_name,
        log.actor_role,
        log.action,
        log.entity_type,
        log.summary,
        JSON.stringify(log.metadata ?? {}),
      ].join(" ").toLowerCase();
      return (!auditFrom || logDate >= auditFrom)
        && (!auditTo || logDate <= auditTo)
        && (auditRole === "all" || log.actor_role === auditRole)
        && (auditStatus === "all" || log.status.toLowerCase() === auditStatus)
        && (!query || searchableText.includes(query));
    });
  }, [auditFrom, auditLogs, auditRole, auditSearch, auditStatus, auditTo]);
  const paginatedAuditLogs = paginateItems(filteredAuditLogs, auditPage);
  const reportRows = report?.rows ?? [];
  const paginatedReportRows = paginateItems(reportRows, reportPage);
  const paginatedBackupHistory = paginateItems(backupHistory, backupPage, 3);

  function getBackupSummaryDetails(recordCounts?: Record<string, number>) {
    return BACKUP_SUMMARY_GROUPS.map(({ label, tables }) => ({
      label,
      count: recordCounts
        ? tables.reduce((count, table) => count + Number(recordCounts[table] ?? 0), 0)
        : null,
    }));
  }

  function parseBackupRecordCounts(headers: Headers): Record<string, number> | null {
    const rawCounts = headers.get("x-backup-record-counts");
    if (!rawCounts) return null;
    try {
      const value: unknown = JSON.parse(rawCounts);
      if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
      const entries = Object.entries(value);
      if (!entries.every(([, count]) => typeof count === "number" && Number.isFinite(count) && count >= 0)) return null;
      return Object.fromEntries(entries) as Record<string, number>;
    } catch (error) {
      console.error("Unable to read backup record-count metadata:", error);
      return null;
    }
  }

  function formatFileSize(size: number) {
    if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  async function runAction(action: () => Promise<void>, success: string) {
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await action();
      notify("success", success);
      await loadModule();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Unable to complete the request.");
    } finally {
      setIsSaving(false);
    }
  }

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(async () => {
      await apiRequest("/api/admin/workspace/customers", {
        method: "POST",
        body: JSON.stringify({
          displayName: newCustomerName,
          contactNumber: newCustomerContact,
          isVip: newCustomerIsVip,
        }),
      });
      setNewCustomerName("");
      setNewCustomerContact("");
      setNewCustomerIsVip(false);
      setShowCustomerForm(false);
    }, "Customer account added.");
  }

  async function savePromotion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const isEditing = editingPromotionId !== null;
    await runAction(async () => {
      await apiRequest(`/api/admin/workspace/promotions${editingPromotionId ? `/${editingPromotionId}` : ""}`, {
        method: isEditing ? "PATCH" : "POST",
        body: JSON.stringify({
          ...promotionForm,
          discountValue: Number(promotionForm.discountValue),
          startsAt: new Date(promotionForm.startsAt).toISOString(),
          endsAt: new Date(promotionForm.endsAt).toISOString(),
          imageDataUrl: promotionForm.imageDataUrl,
          eligibleServiceIds: promotionForm.limitToServices ? promotionForm.serviceIds : [],
          minimumSpend: promotionForm.minimumSpend === "" ? null : Number(promotionForm.minimumSpend),
          maximumDiscount: promotionForm.maximumDiscount === "" ? null : Number(promotionForm.maximumDiscount),
          usageLimit: promotionForm.usageLimit === "" ? null : Number(promotionForm.usageLimit),
        }),
      });
      setEditingPromotionId(null);
      setShowPromotionForm(false);
      setPromotionForm(emptyPromotionForm());
    }, isEditing ? "Promotion updated." : "Promotion created.");
  }

  function editPromotion(promotion: Promotion) {
    setShowPromotionForm(true);
    setEditingPromotionId(promotion.id);
    setPromotionForm({
      title: promotion.title,
      description: promotion.description ?? "",
      discountType: promotion.discount_type,
      discountValue: String(promotion.discount_value),
      startsAt: localDateTime(promotion.starts_at),
      endsAt: localDateTime(promotion.ends_at),
      imageDataUrl: promotion.image_data_url,
      limitToServices: promotion.eligible_service_ids.length > 0,
      serviceIds: promotion.eligible_service_ids,
      minimumSpend: promotion.minimum_spend === null ? "" : String(promotion.minimum_spend),
      maximumDiscount: promotion.maximum_discount === null ? "" : String(promotion.maximum_discount),
      usageLimit: promotion.usage_limit === null ? "" : String(promotion.usage_limit),
      onePerCustomer: promotion.one_per_customer,
      excludePackages: promotion.exclude_packages,
    });
  }

  async function savePackage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(async () => {
      await apiRequest("/api/admin/workspace/packages", {
        method: "POST",
        body: JSON.stringify({
          ...packageForm,
          price: Number(packageForm.price),
        }),
      });
      setShowPackageForm(false);
      setPackageForm({ title: "", description: "", price: "", serviceIds: [], imageDataUrl: null });
    }, "Service package created.");
  }

  async function setPackageActive(packageItem: ServicePackage) {
    await runAction(async () => {
      await apiRequest(`/api/admin/workspace/packages/${packageItem.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !packageItem.is_active }),
      });
    }, packageItem.is_active ? "Package deactivated." : "Package activated.");
  }

  async function selectBannerImage(
    event: ChangeEvent<HTMLInputElement>,
    setImage: (image: string | null) => void
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setErrorMessage(null);
    try {
      const image = await prepareBannerImage(file);
      setImage(image.dataUrl);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to prepare the banner image.");
    }
  }

  async function checkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(async () => {
      await apiRequest("/api/admin/workspace/transactions", {
        method: "POST",
        body: JSON.stringify({
          queueEntryId: selectedTicket,
          paymentMethod,
        }),
      });
      setSelectedTicket("");
      setShowCheckoutForm(false);
    }, "Checkout recorded.");
  }

  async function requestPosAdjustment(transaction: Transaction, adjustmentType: "refund" | "void") {
    const reason = window.prompt(`Reason for ${adjustmentType} of transaction #${transaction.ticket_number}?`)?.trim();
    if (!reason) return;
    const amount = adjustmentType === "void"
      ? Number(transaction.total_amount)
      : Number(window.prompt("Refund amount", String(transaction.total_amount)));
    if (!Number.isFinite(amount) || amount <= 0) return;
    if (canReviewPosAdjustments) {
      setErrorMessage(null);
      setSuccessMessage(null);
      setPosAdminPassword("");
      setPosPasswordAction({ type: "request", transaction, adjustmentType, amount, reason });
      return;
    }

    await runAction(async () => {
      await apiRequest(`/api/admin/workspace/transactions/${transaction.id}/adjustments`, {
        method: "POST",
        body: JSON.stringify({ adjustmentType, amount, reason }),
      });
    }, `${adjustmentType === "void" ? "Void" : "Refund"} request submitted for approval.`);
  }

  async function rejectPosAdjustment(adjustmentId: string) {
    if (!await confirm({
      title: "Reject refund or void request",
      message: "Reject this refund or void request?",
      confirmLabel: "Reject request",
      destructive: true,
    })) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    setPosAdminPassword("");
    setPosPasswordAction({ type: "reject", adjustmentId });
  }

  function beginPosAdjustmentApproval(adjustmentId: string) {
    setErrorMessage(null);
    setSuccessMessage(null);
    setPosAdminPassword("");
    setPosPasswordAction({ type: "approve", adjustmentId });
  }

  async function submitPosPasswordAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!posPasswordAction || !posAdminPassword) return;

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      if (posPasswordAction.type === "request") {
        const { transaction, adjustmentType, amount, reason } = posPasswordAction;
        await apiRequest(`/api/admin/workspace/transactions/${transaction.id}/adjustments`, {
          method: "POST",
          body: JSON.stringify({ adjustmentType, amount, reason, password: posAdminPassword }),
        });
        setSuccessMessage(`${adjustmentType === "void" ? "Void" : "Refund"} request submitted for approval.`);
      } else {
        const { type, adjustmentId } = posPasswordAction;
        await apiRequest(`/api/admin/workspace/transaction-adjustments/${adjustmentId}/${type}`, {
          method: "PATCH",
          body: JSON.stringify({ password: posAdminPassword }),
        });
        setSuccessMessage(type === "approve" ? "Adjustment approved." : "Adjustment rejected.");
      }

      setPosPasswordAction(null);
      setPosAdminPassword("");
      await loadModule();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to verify your password or complete the adjustment.");
      setPosAdminPassword("");
    } finally {
      setIsSaving(false);
    }
  }

  async function loadReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reportFrom > reportTo) {
      setErrorMessage("The start date must be on or before the end date.");
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result = await apiRequest<{ report: Report }>(
        `/api/admin/workspace/reports?type=${reportType}&from=${encodeURIComponent(new Date(`${reportFrom}T00:00:00`).toISOString())}&to=${encodeURIComponent(new Date(`${reportTo}T23:59:59.999`).toISOString())}`
      );
      setReport(result.report);
      setReportPage(1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load the report.");
    } finally {
      setIsLoading(false);
    }
  }

  async function exportBackup() {
    setShowBackupConfirmation(false);
    setIsSaving(true);
    setErrorMessage(null);
    setDownloadState({
      status: "running",
      message: "Creating full operational backup…",
      progressPercent: null,
      details: getBackupSummaryDetails(backupSummaryCounts ?? undefined),
    });
    try {
      const result = await apiRequestWithProgress<{ backup: BackupExportPayload }>(
        "/api/admin/workspace/backup",
        (progressPercent, headers) => {
          const recordCounts = parseBackupRecordCounts(headers);
          if (recordCounts) setBackupSummaryCounts(recordCounts);
          setDownloadState({
            status: "running",
            message: progressPercent === null ? "Receiving backup data…" : "Downloading backup data…",
            progressPercent,
            details: getBackupSummaryDetails(recordCounts ?? backupSummaryCounts ?? undefined),
          });
        },
      );
      const recordCounts = result.backup.recordCounts ?? {};
      setBackupSummaryCounts(recordCounts);
      const details = getBackupSummaryDetails(recordCounts);
      setDownloadState({
        status: "running",
        message: "Preparing backup file…",
        progressPercent: 100,
        details,
      });
      downloadJson(`lynq-admin-backup-${localDate(new Date())}.json`, result.backup);
      setDownloadState({
        status: "success",
        message: "Backup file prepared and handed to your browser. Check Downloads or your browser’s selected save location.",
        progressPercent: 100,
        details,
      });
      await loadModule();
    } catch (error) {
      setDownloadState({
        status: "error",
        message: error instanceof Error ? error.message : "Unable to export backup.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function resetOperationalData() {
    if (!operationalResetPreview || operationalResetConfirmation !== operationalResetPreview.confirmationPhrase) return;
    setShowOperationalResetConfirmation(false);
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await apiRequest<{ message: string }>("/api/admin/workspace/operational-reset", {
        method: "POST",
        body: JSON.stringify({ confirmation: operationalResetConfirmation }),
      });
      setSuccessMessage(result.message);
      setOperationalResetConfirmation("");
      await loadModule();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to clear operational data.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveScheduledBackup(file: ScheduledBackupFile) {
    setSavingBackupFile(file.fileName);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await apiDownload(
        `/api/admin/workspace/backup/files/${encodeURIComponent(file.fileName)}`,
        file.fileName,
      );
      setSuccessMessage(`${file.fileName} was sent to your browser’s download location.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to download the scheduled backup.");
    } finally {
      setSavingBackupFile(null);
    }
  }

  async function restoreBackup() {
    const file = backupFile;
    if (!file) return;
    if (file.size > 200 * 1024 * 1024) {
      setErrorMessage("Backup file must be smaller than 200 MB.");
      return;
    }

    setShowRestoreConfirmation(false);
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const backup = JSON.parse(await file.text()) as Record<string, unknown>;
      const result = await apiRequest<{ recordCounts: Record<string, number> }>("/api/admin/workspace/backup/restore", {
        method: "POST",
        body: JSON.stringify({ backup }),
      });
      setSuccessMessage(`Restore completed: ${Object.entries(result.recordCounts).map(([key, value]) => `${key} ${value}`).join(", ")}.`);
      setBackupFile(null);
      setBackupRestorePreview(null);
      await loadModule();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to restore backup.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleBackupFileChange(file: File | null) {
    const readId = ++backupFileReadId.current;
    setBackupFile(null);
    setBackupRestorePreview(null);
    setShowRestoreConfirmation(false);
    setErrorMessage(null);
    setSuccessMessage(null);
    if (!file) return;
    if (file.size > 200 * 1024 * 1024) {
      setErrorMessage("Backup file must be smaller than 200 MB.");
      return;
    }

    try {
      const parsedValue: unknown = JSON.parse(await file.text());
      if (readId !== backupFileReadId.current) return;
      if (typeof parsedValue !== "object" || parsedValue === null || Array.isArray(parsedValue)) {
        throw new Error("The selected file is not a valid LynQ backup.");
      }
      const backup = parsedValue as Record<string, unknown>;
      if (backup.format !== "lynq-admin-backup-v2") {
        throw new Error("The selected file is not a supported LynQ backup.");
      }
      const rawCounts = typeof backup.recordCounts === "object" && backup.recordCounts !== null && !Array.isArray(backup.recordCounts)
        ? backup.recordCounts as Record<string, unknown>
        : {};
      const missingTables = BACKUP_SUMMARY_GROUPS.flatMap(({ tables }) =>
        tables.filter((table) => !Array.isArray(backup[table]))
      );
      if (missingTables.length > 0) {
        throw new Error("This backup is incomplete. It must contain every operational data table.");
      }
      const recordCounts = Object.fromEntries(BACKUP_SUMMARY_GROUPS.map(({ tables, label }) => {
        const total = tables.reduce((count, table) => {
          const rows = backup[table] as unknown[];
          const declaredCount = rawCounts[table];
          if (typeof declaredCount !== "number" || declaredCount !== rows.length) {
            throw new Error(`The backup record count for ${table} does not match its data.`);
          }
          return count + rows.length;
        }, 0);
        return [label, total];
      }));
      setBackupFile(file);
      setBackupRestorePreview({
        exportedAt: typeof backup.exportedAt === "string" ? backup.exportedAt : null,
        recordCounts,
      });
    } catch (error) {
      if (readId !== backupFileReadId.current) return;
      console.error("Backup file preview failed:", error);
      setErrorMessage(error instanceof Error ? error.message : "Unable to read the selected backup file.");
    }
  }

  async function exportAuditLogs() {
    if (!await confirm({
      title: "Export audit logs",
      message: `Download ${filteredAuditLogs.length} filtered audit log records as a CSV file?`,
      confirmLabel: "Download CSV",
    })) return;
    setDownloadState({ status: "running", message: "Preparing audit log export…" });
    const rows = [
      ["Log no.", "Date & time", "Name", "Role", "Action", "Before", "After", "Status"],
      ...filteredAuditLogs.map((log, index) => {
        const metadata = log.metadata ?? {};
        const before = metadata.before ?? metadata.previous ?? "—";
        const after = metadata.after ?? Object.fromEntries(
          Object.entries(metadata).filter(([key]) => !["summary", "before", "previous", "status"].includes(key))
        );
        return [
          String(index + 1),
          new Date(log.created_at).toLocaleString(),
          log.actor_name,
          log.actor_role,
          log.summary,
          formatAuditValue(before),
          formatAuditValue(after),
          log.status,
        ];
      }),
    ];
    const csv = rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `lynq-audit-logs-${localDate(new Date())}.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    setDownloadState({
      status: "success",
      message: "Audit log file prepared and sent to your browser. Check your browser downloads for transfer progress.",
      progressPercent: 100,
    });
  }

  async function exportReport() {
    if (!report) return;
    const formatLabel = reportFileType === "pdf" ? "PDF print dialog" : `${reportFileType.toUpperCase()} file`;
    if (!await confirm({
      title: "Prepare report",
      message: `Prepare the report as a ${formatLabel}?`,
      confirmLabel: "Prepare report",
    })) return;
    setDownloadState({ status: "running", message: "Preparing report…" });
    const currentReportType = REPORT_TYPES.find((item) => item.id === report.reportType);
    const rows: (string | number)[][] = [
      ["Report", currentReportType?.label ?? "Salon report"],
      ["From", new Date(report.from).toLocaleDateString()],
      ["To", new Date(report.to).toLocaleDateString()],
      [],
      ["Metric", "Value"],
      ["Visits", report.visits],
      ["Completed visits", report.completed],
      ["No-show rate (%)", report.noShowRate],
      ["Appointments", report.appointments],
      ["Paid transactions", report.transactions],
      ["Revenue", report.revenue],
      ["Discounts", report.discounts],
    ];
    if (report.rows.length > 0) {
      rows.push([], Object.keys(report.rows[0]));
      rows.push(...report.rows.map((row) => Object.values(row).map((value) => value ?? "")));
    }

    const escapeHtml = (value: string | number) => String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
    const baseFilename = `lynq-${report.reportType}-report-${reportFrom}-to-${reportTo}`;
    let content: BlobPart;
    let mimeType: string;
    let extension: string;

    if (reportFileType === "csv") {
      content = `\uFEFF${rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n")}`;
      mimeType = "text/csv;charset=utf-8";
      extension = "csv";
    } else {
      const table = `<table><tbody>${rows.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
      const title = escapeHtml(currentReportType?.label ?? "Salon report");
      const dateLabel = `${escapeHtml(new Date(report.from).toLocaleDateString())} – ${escapeHtml(new Date(report.to).toLocaleDateString())}`;
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font:14px Arial,sans-serif;color:#262626;padding:32px}h1{font-size:24px}p{color:#666}table{border-collapse:collapse;width:100%;margin-top:24px}td{border:1px solid #d8d8d8;padding:8px;text-align:left}tr:nth-child(even){background:#f3f3f3}@media print{body{padding:0}}</style></head><body><h1>${title}</h1><p>${dateLabel}</p>${table}</body></html>`;
      content = html;
      mimeType = "application/vnd.ms-excel;charset=utf-8";
      extension = "xls";

      if (reportFileType === "pdf") {
        const printWindow = window.open("", "_blank");
        if (!printWindow) {
          setErrorMessage("Allow pop-ups to open the print dialog and save this report as a PDF.");
          setDownloadState({ status: "error", message: "Allow pop-ups to open the print dialog and save this report as a PDF." });
          return;
        }
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        window.setTimeout(() => {
          printWindow.focus();
          printWindow.print();
        }, 250);
        setDownloadState({
          status: "success",
          message: "Report opened in the print dialog. Choose Save as PDF to download it.",
          progressPercent: 100,
        });
        return;
      }
    }

    const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${baseFilename}.${extension}`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    setDownloadState({
      status: "success",
      message: "Report file prepared and sent to your browser. Check your browser downloads for transfer progress.",
      progressPercent: 100,
    });
  }

  function updateReportDateRange(range: ReportDateRange) {
    setReportDateRange(range);
    if (range === "custom") return;

    const today = new Date();
    const from = new Date(today);
    if (range === "thisMonth") {
      from.setDate(1);
    } else {
      const days = range === "last7" ? 6 : range === "last90" ? 89 : 29;
      from.setDate(from.getDate() - days);
    }
    setReportFrom(localDate(from));
    setReportTo(localDate(today));
    setReport(null);
  }

  const currentTicket = candidates.find((candidate) => candidate.id === selectedTicket);
  const subtotal = currentTicket?.services.reduce((sum, service) => sum + service.price, 0) ?? 0;
  const displayedBackupDetails = getBackupSummaryDetails(backupSummaryCounts ?? undefined);
  const totalBackupRecords = displayedBackupDetails.reduce((sum, item) => sum + (item.count ?? 0), 0);
  const latestExport = backupHistory.find((item) => item.action === "export");

  const isBackupModule = module === "backup-restore";
  const isCustomerTagging = module === "customer-tagging";
  return (
    <main className={`pastel-pink-gradient-page text-ink ${
      isBackupModule
        ? "h-full min-h-0 overflow-hidden px-3 pb-3 pt-3 sm:px-4 sm:pb-4 sm:pt-4"
        : isCustomerTagging
          ? "flex h-full min-h-0 flex-col overflow-hidden px-3 pb-10 pt-2 sm:px-4 sm:pb-10 sm:pt-3"
        : "h-full min-h-0 overflow-hidden p-3 sm:p-5"
    }`}>
      <div className={`mx-auto h-full min-h-0 max-w-6xl ${
        isBackupModule
          ? "flex w-full flex-col overflow-y-auto"
          : isCustomerTagging
            ? "flex w-full flex-col overflow-hidden"
            : "overflow-y-auto pb-10"
      }`}>
        {errorMessage && <p role="alert" className={`rounded-lg border border-clay/20 bg-clay-light text-clay ${isBackupModule ? "mt-1 px-3 py-1.5 text-xs" : "mt-4 px-4 py-3 text-sm"}`}>{errorMessage}</p>}
        {successMessage && <p role="status" className={`rounded-lg border border-success/20 bg-success-soft text-success ${isBackupModule ? "mt-1 px-3 py-1.5 text-xs" : "mt-4 px-4 py-3 text-sm"}`}>{successMessage}</p>}
        {module !== "backup-restore" && (
          <div className="mt-4">
            <DownloadFeedback state={downloadState} />
          </div>
        )}
        {module === "backup-restore" && downloadState.status !== "idle" && (
          <DownloadFeedback
            state={downloadState}
            floating
            onDismiss={() => setDownloadState({ status: "idle" })}
          />
        )}

        {module === "customer-tagging" && (
          <div className="mt-2 grid min-h-0 flex-1 gap-3">
            <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-mist bg-white p-3 sm:p-4">
              <div className="mb-2 flex shrink-0 flex-col gap-2 sm:flex-row">
                <button type="button" onClick={() => setShowCustomerForm(true)} className="dashboard-primary-action min-h-10 rounded-lg px-4 text-sm font-semibold">Add customer</button>
                <input value={customerSearch} onChange={(event) => { setCustomerSearch(event.target.value); setCustomerPage(1); }} placeholder="Search by customer or phone" aria-label="Search customers" className="dashboard-filter-control min-w-0 flex-1 outline-none focus:border-sage" />
                <button type="button" onClick={() => void loadModule()} className="min-h-11 rounded-lg border border-mist px-4 text-sm font-semibold text-sage-deep hover:bg-sage-light">Refresh</button>
              </div>
              {isLoading ? <p className="py-8 text-sm text-ink/50">Loading customers…</p> : filteredCustomers.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink/50">No customers found. Add an account above or wait for a customer to join the queue.</p>
              ) : (
                <ul className="mt-2 min-h-0 flex-1 divide-y divide-mist">
                  {paginatedCustomers.items.map((customer) => {
                    return (
                      <li key={customer.id} className="py-2">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">{customer.display_name}</p>
                            <p className="text-xs text-ink/50">{customer.contact_number}</p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {customer.is_vip && <span className="rounded-full bg-gold-light px-2 py-1 text-[10px] font-semibold text-ink/75">VIP</span>}
                            </div>
                          </div>
                          <label className="inline-flex min-h-9 items-center gap-2 text-xs font-medium">
                            <input type="checkbox" checked={customer.is_vip} disabled={isSaving} onChange={(event) => void runAction(async () => {
                              await apiRequest(`/api/admin/workspace/customers/${customer.id}/vip`, { method: "POST", body: JSON.stringify({ isVip: event.target.checked }) });
                            }, "VIP status updated.")} />
                            VIP customer
                          </label>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {!isLoading && filteredCustomers.length > 0 && (
                <div className="customer-tagging-pagination shrink-0">
                  <PaginationControls
                    page={paginatedCustomers.page}
                    totalPages={paginatedCustomers.totalPages}
                    firstItem={paginatedCustomers.firstItem}
                    lastItem={paginatedCustomers.lastItem}
                    totalItems={filteredCustomers.length}
                    onPageChange={setCustomerPage}
                    label="Customers"
                  />
                </div>
              )}
              {showCustomerForm && (
                createPortal(<div className="fixed inset-0 z-[1000] flex items-center justify-center bg-ink/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) setShowCustomerForm(false); }}>
                  <form role="dialog" aria-modal="true" aria-labelledby="create-customer-title" onSubmit={(event) => void createCustomer(event)} className="w-full max-w-md space-y-4 rounded-2xl border border-mist bg-white p-5 shadow-2xl sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">Customer management</p>
                        <h3 id="create-customer-title" className="mt-1 font-display text-xl font-semibold text-ink">Add customer</h3>
                      </div>
                      <button type="button" aria-label="Close dialog" disabled={isSaving} onClick={() => setShowCustomerForm(false)} className="rounded-lg px-2 text-xl text-ink/50 hover:bg-porcelain">×</button>
                    </div>
                    <label className="block text-xs font-medium text-ink/65">
                      Customer name
                      <input required maxLength={100} value={newCustomerName} onChange={(event) => setNewCustomerName(event.target.value)} className="dashboard-filter-control mt-1 w-full text-ink" />
                    </label>
                    <label className="block text-xs font-medium text-ink/65">
                      Mobile number
                      <PhilippinePhoneInput required value={newCustomerContact} onChange={setNewCustomerContact} className="mt-1" />
                    </label>
                    <label className="flex min-h-10 items-center gap-2 text-sm font-medium text-ink/65">
                      <input type="checkbox" checked={newCustomerIsVip} onChange={(event) => setNewCustomerIsVip(event.target.checked)} />
                      VIP customer
                    </label>
                    <div className="flex justify-end gap-2 border-t border-mist pt-3">
                      <button type="button" disabled={isSaving} onClick={() => setShowCustomerForm(false)} className="form-cancel-action min-h-10 rounded-lg px-4 text-sm font-semibold">Cancel</button>
                      <button type="submit" disabled={isSaving} className="dashboard-primary-action min-h-10 rounded-lg px-4 text-sm font-semibold disabled:opacity-50">{isSaving ? "Adding…" : "Add customer"}</button>
                    </div>
                  </form>
                </div>, document.body)
              )}
            </section>
          </div>
        )}

        {module === "promotions-events" && (
          <div className="mt-5">
            <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Promotions and packages">
              <button type="button" role="tab" aria-selected={promotionSection === "offers"} onClick={() => setPromotionSection("offers")} className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${promotionSection === "offers" ? "bg-sage-deep text-white" : "border border-mist bg-white text-ink/65"}`}>Promotions &amp; sales</button>
              <button type="button" role="tab" aria-selected={promotionSection === "packages"} onClick={() => setPromotionSection("packages")} className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${promotionSection === "packages" ? "bg-sage-deep text-white" : "border border-mist bg-white text-ink/65"}`}>Service packages</button>
            </div>
            {promotionSection === "offers" ? (
              <div>
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="font-display text-xl font-semibold text-ink">Promotions &amp; sales</h3>
                    <p className="mt-1 text-sm text-ink/50">Manage offers shown to customers and applied during checkout.</p>
                  </div>
                  <button type="button" onClick={() => {
                    setEditingPromotionId(null);
                    setPromotionForm(emptyPromotionForm());
                    setShowPromotionForm(true);
                  }} className="min-h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-white hover:bg-ink/85">+ New promotion</button>
                </div>
                <div className="mb-4 flex flex-wrap gap-2" aria-label="Filter promotions">
                  {(["all", "live", "scheduled", "inactive", "ended"] as const).map((status) => (
                    <button key={status} type="button" onClick={() => setPromotionStatusFilter(status)} className={`min-h-9 rounded-full px-3 text-xs font-semibold capitalize ${promotionStatusFilter === status ? "bg-ink text-white" : "border border-mist bg-white text-ink/60 hover:border-sage"}`}>
                      {status === "all" ? `All ${promotions.length}` : `${status} ${promotions.filter((promotion) => promotionStatus(promotion) === status).length}`}
                    </button>
                  ))}
                </div>
                <div>
                  <section>
                    {isLoading ? <p className="py-8 text-sm text-ink/50">Loading promotions…</p> : (
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {promotions.filter((promotion) => promotionStatusFilter === "all" || promotionStatus(promotion) === promotionStatusFilter).map((promotion) => {
                          const status = promotionStatus(promotion);
                          return (
                            <article key={promotion.id} className="overflow-hidden rounded-xl border border-mist bg-white shadow-sm transition-shadow hover:shadow-md">
                              <div className={`relative flex aspect-[3/1] items-center justify-between gap-2 px-4 ${status === "live" ? "bg-sage-light" : status === "scheduled" ? "bg-info-soft" : "bg-porcelain"}`}>
                                {promotion.image_data_url && <img src={promotion.image_data_url} alt="" className="absolute inset-0 h-full w-full object-cover" />}
                                <p className={`relative z-10 rounded-md bg-white/90 px-2 py-1 font-display text-xl font-semibold text-ink ${promotion.image_data_url ? "shadow-sm" : ""}`}>{promotion.discount_type === "percent" ? `${promotion.discount_value}%` : `₱${Number(promotion.discount_value).toFixed(0)}`} <span className="font-sans text-[9px] uppercase tracking-wider">off</span></p>
                                <StatusBadge status={status} className="relative z-10">{status}</StatusBadge>
                              </div>
                              <div className="space-y-2 p-3">
                                <div>
                                  <h4 className="font-semibold text-ink">{promotion.title}</h4>
                                  <p className="mt-1 line-clamp-2 min-h-8 text-xs text-ink/55">{promotion.description || "No description added."}</p>
                                </div>
                                <p className="text-[10px] text-ink/45">◷ {new Date(promotion.starts_at).toLocaleString()} – {new Date(promotion.ends_at).toLocaleString()}</p>
                                {(promotion.eligible_service_ids.length > 0 || promotion.minimum_spend !== null || promotion.maximum_discount !== null || promotion.usage_limit !== null || promotion.one_per_customer || promotion.exclude_packages) && (
                                  <p className="text-[10px] text-ink/50">
                                    {[
                                      promotion.eligible_service_ids.length > 0 ? "Selected services only" : null,
                                      promotion.minimum_spend !== null ? `Min. ₱${Number(promotion.minimum_spend).toFixed(2)}` : null,
                                      promotion.maximum_discount !== null ? `Max. ₱${Number(promotion.maximum_discount).toFixed(2)} off` : null,
                                      promotion.usage_limit !== null ? `${promotion.redemption_count}/${promotion.usage_limit} uses` : null,
                                      promotion.one_per_customer ? "One per customer" : null,
                                      promotion.exclude_packages ? "No packages" : null,
                                    ].filter((rule): rule is string => Boolean(rule)).join(" · ")}
                                  </p>
                                )}
                                <div className="flex items-center justify-between border-t border-mist pt-2">
                                  <label className="flex min-h-9 items-center gap-2 text-[11px] font-medium text-ink/60">
                                    <input type="checkbox" checked={promotion.is_active} disabled={isSaving} onChange={() => void runAction(async () => {
                                      await apiRequest(`/api/admin/workspace/promotions/${promotion.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !promotion.is_active }) });
                                    }, promotion.is_active ? "Promotion deactivated." : "Promotion activated.")} />
                                    {promotion.is_active ? "Active" : "Inactive"}
                                  </label>
                                  <button type="button" disabled={isSaving} onClick={() => editPromotion(promotion)} className="ui-action-edit min-h-9 rounded-lg border border-mist px-3 text-xs font-semibold">Edit</button>
                                </div>
                              </div>
                            </article>
                          );
                        })}
                        <button type="button" onClick={() => {
                          setEditingPromotionId(null);
                          setPromotionForm(emptyPromotionForm());
                          setShowPromotionForm(true);
                        }} className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-mist bg-white p-5 text-center text-ink/60 transition-colors hover:border-sage hover:bg-sage-light/40">
                          <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-full border border-mist text-xl">+</span>
                          <span className="text-sm font-semibold">Create promotion</span>
                          <span className="mt-1 text-xs">Name an offer, set a discount and dates.</span>
                        </button>
                        {promotions.length === 0 && <p className="col-span-full py-6 text-center text-sm text-ink/50">No promotions created yet. Create one to feature it on the customer banner.</p>}
                        {promotions.length > 0 && promotions.filter((promotion) => promotionStatusFilter === "all" || promotionStatus(promotion) === promotionStatusFilter).length === 0 && <p className="col-span-full py-8 text-center text-sm text-ink/50">No promotions match this status.</p>}
                      </div>
                    )}
                  </section>
                  {showPromotionForm && (
                    createPortal(<div className="fixed inset-0 z-[1000] flex items-center justify-center bg-ink/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) { setShowPromotionForm(false); setEditingPromotionId(null); } }}>
                      <form role="dialog" aria-modal="true" aria-labelledby="promotion-editor-title" onSubmit={(event) => void savePromotion(event)} className="max-h-[92dvh] w-full max-w-3xl space-y-3 overflow-y-auto rounded-2xl border border-mist bg-white p-5 shadow-2xl">
                        <div className="flex items-start justify-between gap-2">
                          <div><p className="text-[10px] font-semibold uppercase tracking-wider text-sage-deep">Admin workspace</p><h3 id="promotion-editor-title" className="mt-1 font-display text-xl font-semibold">{editingPromotionId ? "Edit promotion" : "New promotion"}</h3></div>
                          <button type="button" onClick={() => { setShowPromotionForm(false); setEditingPromotionId(null); }} aria-label="Close promotion editor" className="min-h-9 rounded-lg px-2 text-lg text-ink/45 hover:bg-porcelain">×</button>
                        </div>
                        <label className="block text-xs font-semibold text-ink/65">Promotion name
                          <input required maxLength={100} value={promotionForm.title} onChange={(event) => setPromotionForm((current) => ({ ...current, title: event.target.value }))} placeholder="e.g. Weekend Hair Spa" className="dashboard-filter-control mt-1 w-full text-ink" />
                        </label>
                        <label className="block text-xs font-semibold text-ink/65">Description (optional)
                          <textarea value={promotionForm.description} onChange={(event) => setPromotionForm((current) => ({ ...current, description: event.target.value }))} maxLength={500} placeholder="Describe this offer" className="mt-1 min-h-20 w-full rounded-lg border border-mist px-3 py-2 text-sm" />
                        </label>
                        <div>
                          <p className="text-xs font-semibold text-ink/65">Discount</p>
                          <div className="mt-1 grid grid-cols-[1fr_6rem] gap-2">
                            <select value={promotionForm.discountType} onChange={(event) => setPromotionForm((current) => ({ ...current, discountType: event.target.value as "percent" | "fixed" }))} className="dashboard-filter-control w-full"><option value="percent">Percent off</option><option value="fixed">Amount off</option></select>
                            <input required type="number" min="0.01" max={promotionForm.discountType === "percent" ? 100 : undefined} step="0.01" value={promotionForm.discountValue} onChange={(event) => setPromotionForm((current) => ({ ...current, discountValue: event.target.value }))} aria-label="Discount value" className="dashboard-filter-control w-full" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block text-xs font-semibold text-ink/65">Starts<input required type="datetime-local" value={promotionForm.startsAt} onChange={(event) => setPromotionForm((current) => ({ ...current, startsAt: event.target.value }))} className="dashboard-filter-control mt-1 w-full text-ink" /></label>
                          <label className="block text-xs font-semibold text-ink/65">Ends<input required type="datetime-local" value={promotionForm.endsAt} onChange={(event) => setPromotionForm((current) => ({ ...current, endsAt: event.target.value }))} className="dashboard-filter-control mt-1 w-full text-ink" /></label>
                        </div>
                        <fieldset className="space-y-3 rounded-xl border border-mist p-3">
                          <legend className="px-1 text-xs font-semibold text-ink/70">Promotion rules</legend>
                          <label className="flex items-start gap-2 text-xs text-ink/70">
                            <input type="checkbox" checked={promotionForm.limitToServices} onChange={(event) => setPromotionForm((current) => ({ ...current, limitToServices: event.target.checked, serviceIds: event.target.checked ? current.serviceIds : [] }))} />
                            <span><span className="font-semibold">Only selected services</span><span className="mt-0.5 block text-[10px] text-ink/45">Every service in the booking must qualify.</span></span>
                          </label>
                          {promotionForm.limitToServices && (
                            <div>
                              <ServiceCategoryPicker services={packageServices} selectedServiceIds={promotionForm.serviceIds} onChange={(serviceIds) => setPromotionForm((current) => ({ ...current, serviceIds }))} searchLabel="Search promotion services" />
                              {promotionForm.serviceIds.length > 0 && <p className="mt-1 text-[10px] text-ink/45">{promotionForm.serviceIds.length} eligible service(s) selected.</p>}
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-2">
                            <label className="block text-[10px] font-semibold text-ink/60">Minimum spend (optional)
                              <input type="number" min="0" step="0.01" value={promotionForm.minimumSpend} onChange={(event) => setPromotionForm((current) => ({ ...current, minimumSpend: event.target.value }))} placeholder="No minimum" className="dashboard-filter-control mt-1 w-full text-xs" />
                            </label>
                            <label className="block text-[10px] font-semibold text-ink/60">Discount cap (optional)
                              <input type="number" min="0.01" step="0.01" value={promotionForm.maximumDiscount} onChange={(event) => setPromotionForm((current) => ({ ...current, maximumDiscount: event.target.value }))} placeholder="No cap" className="dashboard-filter-control mt-1 w-full text-xs" />
                            </label>
                            <label className="block text-[10px] font-semibold text-ink/60">Total uses (optional)
                              <input type="number" min="1" step="1" value={promotionForm.usageLimit} onChange={(event) => setPromotionForm((current) => ({ ...current, usageLimit: event.target.value }))} placeholder="Unlimited" className="dashboard-filter-control mt-1 w-full text-xs" />
                            </label>
                          </div>
                          <label className="flex items-center gap-2 text-xs text-ink/70"><input type="checkbox" checked={promotionForm.onePerCustomer} onChange={(event) => setPromotionForm((current) => ({ ...current, onePerCustomer: event.target.checked }))} />One use per customer (requires a mobile number)</label>
                          <label className="flex items-center gap-2 text-xs text-ink/70"><input type="checkbox" checked={promotionForm.excludePackages} onChange={(event) => setPromotionForm((current) => ({ ...current, excludePackages: event.target.checked }))} />Exclude service packages</label>
                        </fieldset>
                        <div>
                          <label className="block text-xs font-semibold text-ink/65">Banner (optional)</label>
                          <p className="mt-1 text-[10px] text-ink/45">JPG, PNG, or WebP · cropped to 1200 × 400 px (3:1).</p>
                          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void selectBannerImage(event, (imageDataUrl) => setPromotionForm((current) => ({ ...current, imageDataUrl })))} className="mt-2 block w-full text-xs text-ink/60 file:mr-3 file:min-h-9 file:rounded-lg file:border-0 file:bg-sage-light file:px-3 file:font-semibold file:text-sage-deep" />
                          {promotionForm.imageDataUrl && <div className="mt-2 max-w-sm"><img src={promotionForm.imageDataUrl} alt="Promotion banner preview" className="aspect-[3/1] w-full rounded-lg object-cover" /><button type="button" onClick={() => setPromotionForm((current) => ({ ...current, imageDataUrl: null }))} className="ui-action-danger mt-1 rounded px-1 text-xs">Remove banner</button></div>}
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button type="submit" disabled={isSaving || (promotionForm.limitToServices && promotionForm.serviceIds.length === 0)} className="dashboard-primary-action min-h-10 flex-1 rounded-lg px-3 text-sm font-semibold disabled:opacity-50">{editingPromotionId ? "Save changes" : "Create promotion"}</button>
                          <button type="button" onClick={() => { setShowPromotionForm(false); setEditingPromotionId(null); }} className="form-cancel-action min-h-10 rounded-lg px-3 text-sm font-semibold">Cancel</button>
                        </div>
                      </form>
                    </div>, document.body)
                  )}
                </div>
              </div>
            ) : promotionSection === "packages" ? (
              <div>
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="font-display text-xl font-semibold text-ink">Service packages</h3>
                    <p className="mt-1 text-sm text-ink/50">Bundle services at a set price. Packages appear in their own booking category and can feature on the customer banner.</p>
                  </div>
                  <button type="button" onClick={() => setShowPackageForm(true)} className="min-h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-white hover:bg-ink/85">+ New package</button>
                </div>
                <div className="mb-4 flex flex-wrap gap-2" aria-label="Filter packages">
                  {(["all", "active", "inactive"] as const).map((status) => (
                    <button key={status} type="button" onClick={() => setPackageStatusFilter(status)} className={`min-h-9 rounded-full px-3 text-xs font-semibold capitalize ${packageStatusFilter === status ? "bg-ink text-white" : "border border-mist bg-white text-ink/60 hover:border-sage"}`}>
                      {status === "all" ? `All ${packages.length}` : `${status} ${packages.filter((item) => item.is_active === (status === "active")).length}`}
                    </button>
                  ))}
                </div>
                {isLoading ? <p className="py-8 text-sm text-ink/50">Loading packages…</p> : (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {packages.filter((item) => packageStatusFilter === "all" || item.is_active === (packageStatusFilter === "active")).map((packageItem) => (
                      <article key={packageItem.id} className="overflow-hidden rounded-xl border border-mist bg-white shadow-sm transition-shadow hover:shadow-md">
                        <div className="relative flex aspect-[3/1] items-center justify-between bg-sage-light px-4">
                          {packageItem.image_data_url && <img src={packageItem.image_data_url} alt="" className="absolute inset-0 h-full w-full object-cover" />}
                          <p className="relative z-10 rounded-md bg-white/90 px-2 py-1 font-display text-xl font-semibold text-ink">₱{Number(packageItem.price).toFixed(0)}</p>
                          <StatusBadge status={packageItem.is_active ? "active" : "inactive"} className="relative z-10">{packageItem.is_active ? "Active" : "Inactive"}</StatusBadge>
                        </div>
                        <div className="space-y-2 p-3">
                          <div>
                            <h4 className="font-semibold text-ink">{packageItem.title}</h4>
                            <p className="mt-1 line-clamp-2 min-h-8 text-xs text-ink/55">{packageItem.description || "No description added."}</p>
                          </div>
                          <p className="text-[10px] text-ink/50">{packageItem.service_package_items.map((item) => item.services?.name ?? "Service").join(" · ")}</p>
                          <div className="flex items-center justify-between border-t border-mist pt-2">
                            <label className="flex min-h-9 items-center gap-2 text-[11px] font-medium text-ink/60">
                              <input type="checkbox" checked={packageItem.is_active} disabled={isSaving} onChange={() => void setPackageActive(packageItem)} />
                              {packageItem.is_active ? "Active" : "Inactive"}
                            </label>
                            <span className="text-[10px] text-ink/40">Customer banner eligible</span>
                          </div>
                        </div>
                      </article>
                    ))}
                    <button type="button" onClick={() => setShowPackageForm(true)} className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-mist bg-white p-5 text-center text-ink/60 transition-colors hover:border-sage hover:bg-sage-light/40">
                      <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-full border border-mist text-xl">+</span>
                      <span className="text-sm font-semibold">Create service package</span>
                      <span className="mt-1 text-xs">Choose services and set a package price.</span>
                    </button>
                    {packages.length === 0 && <p className="col-span-full py-4 text-center text-sm text-ink/50">No packages created yet.</p>}
                    {packages.length > 0 && packages.filter((item) => packageStatusFilter === "all" || item.is_active === (packageStatusFilter === "active")).length === 0 && <p className="col-span-full py-8 text-center text-sm text-ink/50">No packages match this status.</p>}
                  </div>
                )}
                {showPackageForm && (
                createPortal(<div className="fixed inset-0 z-[1000] flex items-center justify-center bg-ink/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) setShowPackageForm(false); }}>
                <form role="dialog" aria-modal="true" aria-labelledby="package-editor-title" onSubmit={(event) => void savePackage(event)} className="max-h-[92dvh] w-full max-w-xl space-y-3 overflow-y-auto rounded-2xl border border-mist bg-white p-5 shadow-2xl">
                  <div className="flex items-start justify-between gap-2">
                    <div><p className="text-[10px] font-semibold uppercase tracking-wider text-sage-deep">Admin workspace</p><h3 id="package-editor-title" className="mt-1 font-display text-xl font-semibold">Create service package</h3></div>
                    <button type="button" onClick={() => setShowPackageForm(false)} aria-label="Close package editor" className="min-h-9 rounded-lg px-2 text-lg text-ink/45 hover:bg-porcelain">×</button>
                  </div>
                  <input required maxLength={100} value={packageForm.title} onChange={(event) => setPackageForm((current) => ({ ...current, title: event.target.value }))} placeholder="Package name" className="w-full rounded-lg border border-mist px-3 text-sm" />
                  <textarea value={packageForm.description} onChange={(event) => setPackageForm((current) => ({ ...current, description: event.target.value }))} maxLength={500} placeholder="Description (optional)" className="min-h-20 w-full rounded-lg border border-mist px-3 py-2 text-sm" />
                  <label className="block text-xs font-medium text-ink/55">Package price
                    <input required type="number" min="0.01" step="0.01" value={packageForm.price} onChange={(event) => setPackageForm((current) => ({ ...current, price: event.target.value }))} className="dashboard-filter-control mt-1 w-full text-ink" />
                  </label>
                  <fieldset>
                    <legend className="text-xs font-medium text-ink/55">Included services ({packageForm.serviceIds.length} selected)</legend>
                    <div className="mt-2">
                      <ServiceCategoryPicker services={packageServices} selectedServiceIds={packageForm.serviceIds} onChange={(serviceIds) => setPackageForm((current) => ({ ...current, serviceIds }))} searchLabel="Search available package services" />
                    </div>
                  </fieldset>
                  <div>
                    <label className="block text-xs font-medium text-ink/55">Banner image (optional)</label>
                    <p className="mt-1 text-[11px] text-ink/45">Upload JPG, PNG, or WebP. Images are center-cropped to 1200 × 400 px (3:1).</p>
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void selectBannerImage(event, (imageDataUrl) => setPackageForm((current) => ({ ...current, imageDataUrl })))} className="mt-2 block w-full text-xs text-ink/60 file:mr-3 file:min-h-9 file:rounded-lg file:border-0 file:bg-sage-light file:px-3 file:font-semibold file:text-sage-deep" />
                    {packageForm.imageDataUrl && <div className="mt-2"><img src={packageForm.imageDataUrl} alt="Package banner preview" className="aspect-[3/1] w-full rounded-lg object-cover" /><button type="button" onClick={() => setPackageForm((current) => ({ ...current, imageDataUrl: null }))} className="ui-action-danger mt-1 rounded px-1 text-xs">Remove image</button></div>}
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" disabled={isSaving || packageForm.serviceIds.length === 0} className="dashboard-primary-action min-h-10 flex-1 rounded-lg px-3 text-sm font-semibold disabled:opacity-50">Save package</button>
                    <button type="button" onClick={() => setShowPackageForm(false)} className="form-cancel-action min-h-10 rounded-lg px-3 text-sm font-semibold">Cancel</button>
                  </div>
                </form>
                </div>, document.body)
                )}
              </div>
            ) : null}
          </div>
        )}

        {module === "pos-transactions" && (
          <div className={`mt-3 grid gap-2 ${showPaymentHistory ? "xl:grid-cols-[minmax(17rem,0.72fr)_minmax(0,1.8fr)]" : "mx-auto w-full max-w-4xl"}`}>
            <section className="h-fit overflow-hidden rounded-2xl border border-sage/40 bg-white shadow-[0_8px_24px_rgba(47,74,59,0.08)]">
              <div className="flex items-center justify-between bg-sage-deep px-4 py-3 text-white">
                <div className="flex items-center gap-2">
                  <Scissors size={18} aria-hidden="true" />
                  <h3 className="font-display text-sm font-semibold tracking-wide">Salon checkout</h3>
                </div>
                <span className="rounded-full border border-white/25 px-2.5 py-1 text-[10px] font-medium">Completed visits</span>
              </div>
              <div className="space-y-3 bg-[var(--app-surface-soft)] p-4">
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-sage-deep">Ready for payment</p>
                    <p className="mt-1 text-3xl font-semibold tabular-nums text-ink" aria-live="polite">
                      {isLoading ? "—" : candidates.length}
                    </p>
                  </div>
                  <span className="mb-1 rounded-full border border-sage/30 bg-white px-2.5 py-1 text-[10px] font-medium text-sage-deep">
                    {isLoading ? "Loading visits" : candidates.length ? "Awaiting checkout" : "All visits settled"}
                  </span>
                </div>
                <div className="rounded-xl border border-sage/20 bg-white p-3">
                  <div className="flex items-center gap-1.5 text-sage-deep">
                    <Sparkles size={14} aria-hidden="true" />
                    <p className="text-[10px] font-semibold uppercase tracking-wide">Next guest</p>
                  </div>
                  {candidates[0] ? (
                    <div className="mt-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">{candidates[0].customerName}</p>
                          <p className="mt-0.5 text-xs text-ink/55">Visit {formatTicketNumber(candidates[0].ticketNumber)}</p>
                        </div>
                        <Scissors size={18} className="shrink-0 text-sage-deep/70" aria-hidden="true" />
                      </div>
                      {candidates[0].services.length > 0 && (
                        <ul className="mt-2 space-y-1 border-t border-sage/15 pt-2 text-xs text-ink/65">
                          {candidates[0].services.slice(0, 3).map((service, index) => (
                            <li key={`${service.name}-${index}`} className="flex justify-between gap-2">
                              <span className="truncate">{service.name}</span>
                              <span className="shrink-0 tabular-nums">₱{service.price.toFixed(2)}</span>
                            </li>
                          ))}
                          {candidates[0].services.length > 3 && (
                            <li className="text-[10px] text-ink/45">+{candidates[0].services.length - 3} more services</li>
                          )}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-ink/55">{isLoading ? "Loading completed visits…" : "No completed visits are waiting for payment."}</p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={candidates.length === 0 || isLoading}
                  onClick={() => {
                    setSelectedTicket(candidates.length === 1 ? candidates[0].id : "");
                    setShowCheckoutForm(true);
                  }}
                  className="dashboard-primary-action flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50"
                >
                  <ReceiptText size={16} aria-hidden="true" />
                  {candidates.length ? "Take payment" : "No visits to checkout"}
                </button>
                <p className="text-center text-[10px] text-ink/50">Review services · choose payment · complete guest visit</p>
              </div>
            </section>
            {showPaymentHistory && <section className="min-w-0 rounded-2xl border border-sage/25 bg-white p-3 shadow-[0_8px_24px_rgba(47,74,59,0.06)] sm:p-4">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <ReceiptText size={18} className="text-sage-deep" aria-hidden="true" />
                    <h3 className="font-display font-semibold">Visit receipts</h3>
                  </div>
                  <p className="mt-1 text-xs text-ink/50">Payment history for completed salon visits.</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <label className="text-[10px] font-medium text-ink/55">From<input type="date" value={transactionFrom} onChange={(event) => { setTransactionFrom(event.target.value); setTransactionPage(1); }} className="dashboard-filter-control mt-1 block w-full text-ink" /></label>
                  <label className="text-[10px] font-medium text-ink/55">To<input type="date" value={transactionTo} onChange={(event) => { setTransactionTo(event.target.value); setTransactionPage(1); }} className="dashboard-filter-control mt-1 block w-full text-ink" /></label>
                </div>
              </div>
              {transactionAdjustmentsUnavailable && (
                <p role="status" className="mt-4 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-ink/75">
                  Payments and digital receipts remain available, but refund/void history is disabled until migration <code>20261027130000_add_pos_adjustments.sql</code> is applied to Supabase.
                </p>
              )}
              {isReceptionist && !transactionAdjustmentsUnavailable && (
                <p className="mt-4 rounded-lg border border-mist bg-porcelain/60 px-3 py-2 text-xs text-ink/65">
                  Refund and void requests need approval from a different administrator.
                </p>
              )}
              {isLoading ? <p className="py-8 text-sm text-ink/50">Loading receipts…</p> : transactions.length === 0 ? <p className="py-8 text-sm text-ink/50">No payments recorded yet.</p> : (
                <ul className="mt-3 grid gap-1.5" aria-label="Salon visit receipts">
                  {paginatedTransactions.items.map((transaction) => (
                    <li key={transaction.id} className="rounded-xl border border-sage/15 bg-white px-3 py-2.5 transition-colors hover:border-sage/35 hover:bg-[var(--app-surface-soft)]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sage-light text-sage-deep">
                            <Scissors size={16} aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="text-xs font-bold text-sage-deep">{formatTicketNumber(transaction.ticket_number)}</span>
                              <span className="truncate text-sm font-semibold text-ink">{transaction.customer_name}</span>
                            </div>
                            <p className="mt-0.5 text-[10px] text-ink/50">{new Date(transaction.created_at).toLocaleString()} <span className="px-1 text-sage/50">·</span><span className="capitalize">{transaction.payment_method}</span></p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <div className="text-right">
                            <p className="text-sm font-bold tabular-nums text-ink">₱{Number(transaction.total_amount).toFixed(2)}</p>
                            <StatusBadge status={transaction.status}>{transaction.status}</StatusBadge>
                          </div>
                          {(canReviewPosAdjustments || isReceptionist) && transaction.status === "paid" && (
                            <div className="relative min-w-9">
                              <button
                                type="button"
                                aria-label={`Transaction actions for ${formatTicketNumber(transaction.ticket_number)}`}
                                aria-haspopup="menu"
                                aria-expanded={openPosMenuId === transaction.id}
                                disabled={isSaving}
                                onClick={() => setOpenPosMenuId((current) => current === transaction.id ? null : transaction.id)}
                                className="flex min-h-9 w-9 items-center justify-center rounded-full border border-sage/25 bg-white text-sage-deep hover:bg-sage-light disabled:opacity-50"
                              >
                                <Ellipsis size={18} aria-hidden="true" />
                              </button>
                              {openPosMenuId === transaction.id && (
                                <div role="menu" aria-label="Transaction actions" className="absolute right-0 top-full z-20 mt-1.5 grid w-36 gap-1 rounded-xl border border-sage/20 bg-white p-1.5 shadow-lg">
                                  <button type="button" role="menuitem" disabled={isSaving} onClick={() => { setOpenPosMenuId(null); void requestPosAdjustment(transaction, "refund"); }} className="min-h-8 rounded px-2 text-left text-xs font-semibold text-ink/75 hover:bg-sage-light disabled:opacity-50">{isReceptionist ? "Request refund" : "Refund"}</button>
                                  <div aria-hidden="true" className="h-px bg-sage/20" />
                                  <button type="button" role="menuitem" disabled={isSaving} onClick={() => { setOpenPosMenuId(null); void requestPosAdjustment(transaction, "void"); }} className="min-h-8 rounded px-2 text-left text-xs font-semibold text-danger hover:bg-danger/5 disabled:opacity-50">{isReceptionist ? "Request void" : "Void"}</button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      {transaction.adjustments.length > 0 && (
                        <div className="mt-2 border-t border-sage/20 pt-2">
                          {transaction.adjustments.map((adjustment) => (
                            <div key={adjustment.id} className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] text-ink/60" title={adjustment.reason}>
                              <span className="capitalize">{adjustment.adjustment_type}</span>
                              <span>₱{Number(adjustment.amount).toFixed(2)}</span>
                              <span>·</span>
                              <span className="capitalize">{adjustment.status}</span>
                              {canReviewPosAdjustments && adjustment.status === "pending" && adjustment.requested_by !== currentUser?.id && (
                                <>
                                  <button type="button" disabled={isSaving} onClick={() => beginPosAdjustmentApproval(adjustment.id)} className="ui-action-positive rounded px-1 font-semibold underline">Approve</button>
                                  <button type="button" disabled={isSaving} onClick={() => void rejectPosAdjustment(adjustment.id)} className="ui-action-danger rounded px-1 font-semibold underline">Reject</button>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {!isLoading && transactions.length > 0 && (
                <PaginationControls
                  page={paginatedTransactions.page}
                  totalPages={paginatedTransactions.totalPages}
                  firstItem={paginatedTransactions.firstItem}
                  lastItem={paginatedTransactions.lastItem}
                  totalItems={transactions.length}
                  onPageChange={setTransactionPage}
                  label="Transactions"
                />
              )}
            </section>}
            {showCheckoutForm && (
              createPortal(<div className="fixed inset-0 z-[1000] flex items-center justify-center bg-ink/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) setShowCheckoutForm(false); }}>
                <form role="dialog" aria-modal="true" aria-labelledby="checkout-title" onSubmit={(event) => void checkout(event)} className="max-h-[92dvh] w-full max-w-lg space-y-3 overflow-y-auto rounded-2xl border border-mist bg-white p-5 shadow-2xl">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="text-xs font-semibold uppercase tracking-wide text-sage-deep">Salon checkout</p><h3 id="checkout-title" className="mt-1 font-display text-xl font-semibold">Complete guest payment</h3></div>
                    <button type="button" aria-label="Close dialog" disabled={isSaving} onClick={() => setShowCheckoutForm(false)} className="rounded-lg px-2 text-xl text-ink/50 hover:bg-porcelain">×</button>
                  </div>
                  <label className="block text-xs font-medium text-ink/55">Completed visit
                    <select required value={selectedTicket} onChange={(event) => setSelectedTicket(event.target.value)} className="dashboard-filter-control mt-1 w-full">
                      <option value="">Choose a guest visit</option>
                      {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{formatTicketNumber(candidate.ticketNumber)} · {candidate.customerName}{candidate.promotionId ? " · offer applied" : ""}</option>)}
                    </select>
                  </label>
                  {currentTicket && <ul className="space-y-1 rounded-lg bg-porcelain p-3 text-xs">{currentTicket.services.map((service, index) => <li key={`${service.name}-${index}`} className="flex justify-between gap-3"><span>{service.name}</span><span>₱{service.price.toFixed(2)}</span></li>)}<li className="flex justify-between border-t border-mist pt-2 font-semibold"><span>Subtotal</span><span>₱{subtotal.toFixed(2)}</span></li></ul>}
                  <p className="text-xs text-ink/55">The single best eligible promotion is applied automatically at checkout.</p>
                  <label className="block text-xs font-medium text-ink/55">Payment method
                    <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="dashboard-filter-control mt-1 w-full"><option value="cash">Cash</option><option value="card">Card</option><option value="ewallet">E-wallet</option><option value="other">Other</option></select>
                  </label>
                  <div className="flex justify-end gap-2 border-t border-mist pt-3">
                    <button type="button" disabled={isSaving} onClick={() => setShowCheckoutForm(false)} className="form-cancel-action min-h-10 rounded-lg px-4 text-sm font-semibold">Cancel</button>
                    <button type="submit" disabled={isSaving || !selectedTicket} className="dashboard-primary-action min-h-10 rounded-lg px-4 text-sm font-semibold disabled:opacity-50">{isSaving ? "Processing…" : "Record payment"}</button>
                  </div>
                </form>
              </div>, document.body)
            )}
          </div>
        )}

        {posPasswordAction && (
          <div className="fixed inset-0 z-[120] flex items-end justify-center bg-ink/35 p-0 backdrop-blur-sm sm:items-center sm:p-5">
            <form
              role="dialog"
              aria-modal="true"
              aria-labelledby="pos-password-title"
              onSubmit={(event) => void submitPosPasswordAction(event)}
              className="w-full rounded-t-2xl border border-[var(--app-border)] bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-2xl sm:p-6"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sage-deep">Sensitive transaction action</p>
              <h2 id="pos-password-title" className="mt-1 font-display text-xl font-semibold text-ink">Confirm your password</h2>
              <p className="mt-2 text-sm text-ink/60">Enter your administrator password to verify this {posPasswordAction.type === "request" ? `${posPasswordAction.adjustmentType} request` : `adjustment ${posPasswordAction.type}`}.</p>
              {errorMessage && <p role="alert" className="mt-3 rounded-lg border border-clay/20 bg-clay-light px-3 py-2 text-sm text-clay">{errorMessage}</p>}
              <label className="mt-4 block text-xs font-medium text-ink/65">
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  autoFocus
                  required
                  value={posAdminPassword}
                  onChange={(event) => setPosAdminPassword(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-mist bg-white px-3 py-2.5 text-sm text-ink"
                />
              </label>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" disabled={isSaving} onClick={() => { setPosPasswordAction(null); setPosAdminPassword(""); }} className="form-cancel-action rounded-lg px-4 text-sm font-semibold">Cancel</button>
                <button type="submit" disabled={isSaving || !posAdminPassword} className="dashboard-primary-action rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50">{isSaving ? "Verifying…" : "Confirm and continue"}</button>
              </div>
            </form>
          </div>
        )}

        {module === "audit-logs" && (
          <section className="mt-3 overflow-hidden rounded-2xl border border-mist bg-white">
            <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
              <div>
                <h3 className="font-semibold">Audit Log</h3>
                <p className="mt-1 text-sm text-ink/50">Track system activity and queue/customer transactions.</p>
              </div>
              <button type="button" onClick={() => void loadModule()} className="min-h-10 rounded-lg border border-mist px-4 text-sm font-semibold text-ink/70 hover:bg-porcelain">Refresh</button>
            </div>
            <div className="px-4 pb-4 sm:px-6">
              <label className="relative block">
                <span className="sr-only">Search audit logs</span>
                <svg viewBox="0 0 24 24" aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" strokeLinecap="round" /></svg>
                <input type="search" value={auditSearch} onChange={(event) => { setAuditSearch(event.target.value); setAuditPage(1); }} placeholder="Search logs..." className="dashboard-filter-control w-full outline-none focus:border-sage" style={{ paddingLeft: "2.5rem" }} />
              </label>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="mr-1 text-xs font-medium text-ink/45">Filters</span>
                <select value={auditRole} onChange={(event) => { setAuditRole(event.target.value); setAuditPage(1); }} aria-label="Filter by role" className="dashboard-filter-control min-w-44 text-sm">
                  <option value="all">All roles</option>
                  {[...new Set(auditLogs.map((log) => log.actor_role))].sort().map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
                <label className="flex items-center gap-2 rounded-lg border border-mist px-3">
                  <span className="sr-only">From date</span>
                  <input type="date" value={auditFrom} onChange={(event) => { setAuditFrom(event.target.value); setAuditPage(1); }} className="min-h-10 bg-transparent text-sm text-ink outline-none" />
                  <span className="text-ink/35">–</span>
                  <span className="sr-only">To date</span>
                  <input type="date" value={auditTo} onChange={(event) => { setAuditTo(event.target.value); setAuditPage(1); }} className="min-h-10 bg-transparent text-sm text-ink outline-none" />
                </label>
                <select value={auditStatus} onChange={(event) => { setAuditStatus(event.target.value); setAuditPage(1); }} aria-label="Filter by status" className="dashboard-filter-control min-w-40 text-sm">
                  <option value="all">All statuses</option>
                  <option value="success">Success</option>
                  <option value="failed">Failed</option>
                </select>
                <button type="button" onClick={exportAuditLogs} disabled={filteredAuditLogs.length === 0} className="ml-auto inline-flex min-h-10 items-center gap-2 rounded-lg border border-mist px-4 text-sm font-semibold text-ink/75 hover:bg-porcelain disabled:opacity-40">
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Export
                </button>
              </div>
            </div>
            <div className="border-y border-mist px-4 py-3 text-xs text-ink/50 sm:px-6">
              {isLoading ? "Loading audit logs…" : `Showing ${filteredAuditLogs.length} of ${auditLogs.length} logs`}
            </div>
            {isLoading ? (
              <p className="px-4 py-8 text-sm text-ink/50 sm:px-6">Loading audit logs…</p>
            ) : filteredAuditLogs.length === 0 ? (
              <p className="px-4 py-8 text-sm text-ink/50 sm:px-6">{auditLogs.length === 0 ? "No audit events have been recorded yet." : "No logs match these filters."}</p>
            ) : (
              <div className="overflow-x-hidden">
                <table className="admin-responsive-table w-full table-fixed border-separate border-spacing-0 text-left text-sm">
                  <colgroup>
                    <col className="w-[5%]" />
                    <col className="w-[14%]" />
                    <col className="w-[10%]" />
                    <col className="w-[13%]" />
                    <col className="w-[19%]" />
                    <col className="w-[12%]" />
                    <col className="w-[19%]" />
                    <col className="w-[8%]" />
                  </colgroup>
                  <thead className="text-[10px] font-bold uppercase tracking-wide text-ink/45">
                    <tr><th className="bg-porcelain px-3 py-3">Log No.</th><th className="bg-porcelain px-3 py-3">Date &amp; Time</th><th className="bg-porcelain px-3 py-3">Name</th><th className="bg-porcelain px-3 py-3">Role</th><th className="bg-porcelain px-3 py-3">Action</th><th className="bg-porcelain px-3 py-3">Before</th><th className="bg-porcelain px-3 py-3">After</th><th className="bg-porcelain px-3 py-3">Status</th></tr>
                  </thead>
                  <tbody>
                    {paginatedAuditLogs.items.map((log, index) => {
                      const metadata = log.metadata ?? {};
                      const before = metadata.before ?? metadata.previous ?? "—";
                      const after = metadata.after ?? Object.fromEntries(
                        Object.entries(metadata).filter(([key]) => !["summary", "before", "previous", "status"].includes(key))
                      );
                      return (
                        <tr key={log.id} className="border-b border-mist/70 align-top hover:bg-porcelain/60">
                          <td data-label="Log No." className="break-words px-3 py-3 text-xs text-ink/50">{(paginatedAuditLogs.page - 1) * 10 + index + 1}</td>
                          <td data-label="Date & Time" className="break-words px-3 py-3 text-xs text-ink/55">{new Date(log.created_at).toLocaleString()}</td>
                          <td data-label="Name" className="break-words px-3 py-3 font-medium">{log.actor_name}</td>
                          <td data-label="Role" className="break-words px-3 py-3 text-xs text-ink/60">{log.actor_role}</td>
                          <td data-label="Action" className="break-words px-3 py-3">{log.summary}</td>
                          <td data-label="Before" className="break-words px-3 py-3 text-xs text-ink/55"><span className="line-clamp-3 break-all" title={formatAuditValue(before)}>{formatAuditValue(before)}</span></td>
                          <td data-label="After" className="break-words px-3 py-3 text-xs text-ink/55"><span className="line-clamp-3 break-all" title={formatAuditValue(after)}>{formatAuditValue(after)}</span></td>
                          <td data-label="Status" className="break-words px-3 py-3"><StatusBadge status={log.status}>{log.status}</StatusBadge></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {!isLoading && filteredAuditLogs.length > 0 && (
              <PaginationControls
                page={paginatedAuditLogs.page}
                totalPages={paginatedAuditLogs.totalPages}
                firstItem={paginatedAuditLogs.firstItem}
                lastItem={paginatedAuditLogs.lastItem}
                totalItems={filteredAuditLogs.length}
                onPageChange={setAuditPage}
                label="Audit logs"
              />
            )}
          </section>
        )}

        {module === "reports" && (
          <div className="mt-5 grid items-start gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
            <section className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-[var(--app-shadow)]">
              <div className="mb-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--app-ink-muted)]">Salon analytics</p>
                <h2 className="mt-1 font-display text-xl font-semibold text-[var(--color-ink)]">Build a report</h2>
                <p className="mt-1 text-sm text-[var(--app-ink-muted)]">Choose what to include and how to export it.</p>
              </div>
              <form onSubmit={(event) => void loadReport(event)} className="space-y-5">
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--app-ink-muted)]">Report type</p>
                  <button
                    type="button"
                    aria-expanded={reportTypeMenuOpen}
                    aria-controls="report-type-options"
                    onClick={() => setReportTypeMenuOpen((isOpen) => !isOpen)}
                    className="flex min-h-12 w-full items-center justify-between rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] px-3 text-left text-sm font-semibold text-[var(--color-ink)] transition hover:bg-[var(--app-surface-soft)]"
                  >
                    <span>{REPORT_TYPES.find((item) => item.id === reportType)?.label}</span>
                    <svg viewBox="0 0 20 20" aria-hidden="true" className={`h-4 w-4 transition-transform ${reportTypeMenuOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  {reportTypeMenuOpen && (
                    <div id="report-type-options" className="mt-2 space-y-1 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-1.5" role="group" aria-label="Choose report type">
                      {REPORT_TYPES.map((type) => (
                        <button
                          key={type.id}
                          type="button"
                          onClick={() => { setReportType(type.id); setReport(null); setReportTypeMenuOpen(false); }}
                          aria-pressed={reportType === type.id}
                          className={`w-full rounded-lg px-3 py-2 text-left transition ${reportType === type.id ? "bg-[var(--app-accent-soft)] font-semibold text-[var(--color-ink)]" : "text-[var(--app-ink-muted)] hover:bg-[var(--app-surface-soft)]"}`}
                        >
                          <span className="block text-sm">{type.label}</span>
                          <span className="mt-0.5 block text-xs leading-4 text-[var(--app-ink-muted)]">{type.description}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="report-date-range" className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--app-ink-muted)]">Date range</label>
                  <select id="report-date-range" value={reportDateRange} onChange={(event) => updateReportDateRange(event.target.value as ReportDateRange)} className="dashboard-filter-control w-full text-sm">
                    <option value="last7">Last 7 days</option>
                    <option value="last30">Last 30 days</option>
                    <option value="last90">Last 90 days</option>
                    <option value="thisMonth">This month</option>
                    <option value="custom">Custom range</option>
                  </select>
                  {reportDateRange === "custom" && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <label className="text-xs font-medium text-[var(--app-ink-muted)]">From<input required type="date" value={reportFrom} onChange={(event) => { setReportFrom(event.target.value); setReport(null); }} className="dashboard-filter-control mt-1 block w-full text-xs" /></label>
                      <label className="text-xs font-medium text-[var(--app-ink-muted)]">To<input required type="date" value={reportTo} onChange={(event) => { setReportTo(event.target.value); setReport(null); }} className="dashboard-filter-control mt-1 block w-full text-xs" /></label>
                    </div>
                  )}
                  <p className="mt-2 text-xs text-[var(--app-ink-muted)]">
                    {new Date(`${reportFrom}T00:00:00`).toLocaleDateString()} – {new Date(`${reportTo}T00:00:00`).toLocaleDateString()}
                  </p>
                </div>

                <fieldset>
                  <legend className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--app-ink-muted)]">File type</legend>
                  <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="File type">
                    {([
                      ["pdf", "PDF", "Print / save"],
                      ["excel", "Excel", ".xls"],
                      ["csv", "CSV", ".csv"],
                    ] as const).map(([value, label, extension]) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={reportFileType === value}
                        onClick={() => setReportFileType(value)}
                        className={`min-h-14 rounded-xl border px-2 py-2 text-center transition ${reportFileType === value ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--color-ink)] ring-1 ring-[var(--app-accent)]/20" : "border-[var(--app-border)] text-[var(--app-ink-muted)] hover:bg-[var(--app-surface-soft)]"}`}
                      >
                        <span className="block text-sm font-semibold">{label}</span>
                        <span className="block text-[10px]">{extension}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div className="space-y-2 border-t border-[var(--app-border)] pt-4">
                  <button type="submit" disabled={isLoading} className="dashboard-primary-action min-h-11 w-full rounded-xl px-4 text-sm font-semibold disabled:cursor-wait disabled:opacity-50">
                    {isLoading ? "Generating…" : "Generate preview"}
                  </button>
                  <button type="button" onClick={exportReport} disabled={!report} className="min-h-11 w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] px-4 text-sm font-semibold text-[var(--color-ink)] transition hover:bg-[var(--app-surface-soft)] disabled:cursor-not-allowed disabled:opacity-45">
                    {reportFileType === "pdf" ? "Print / save as PDF" : `Download ${reportFileType === "excel" ? "Excel" : "CSV"}`}
                  </button>
                  <p className="text-center text-xs text-[var(--app-ink-muted)]">{report ? `${report.rows.length} report rows` : "Generate a preview to enable export"}</p>
                </div>
              </form>
            </section>

            {isLoading ? (
              <section aria-live="polite" className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-8 text-sm text-[var(--app-ink-muted)] shadow-[var(--app-shadow)]">Generating your report preview…</section>
            ) : report ? (
              <section className="overflow-hidden rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] shadow-[var(--app-shadow)]">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--app-border)] px-5 py-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--app-ink-muted)]">Report preview</p>
                    <h3 className="mt-1 font-display text-xl font-semibold text-[var(--color-ink)]">{REPORT_TYPES.find((item) => item.id === report.reportType)?.label}</h3>
                    <p className="mt-1 text-xs text-[var(--app-ink-muted)]">{new Date(report.from).toLocaleDateString()} – {new Date(report.to).toLocaleDateString()}</p>
                  </div>
                  <span className="rounded-full bg-[var(--app-accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--color-ink)]">{report.rows.length} rows</span>
                </div>
                <div className="grid gap-3 border-b border-[var(--app-border)] p-5 sm:grid-cols-2 xl:grid-cols-3">
                  {[["Visits", report.visits], ["Completed", report.completed], ["No-show rate", `${report.noShowRate.toFixed(1)}%`], ["Appointments", report.appointments], ["Transactions", report.transactions], ["Revenue", `₱${report.revenue.toFixed(2)}`], ["Discounts", `₱${report.discounts.toFixed(2)}`]].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-canvas)] p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--app-ink-muted)]">{label}</p>
                      <p className="mt-1 font-display text-xl font-semibold text-[var(--color-ink)]">{value}</p>
                    </div>
                  ))}
                </div>
                {report.rows.length > 0 && ["revenue", "visits"].includes(report.reportType) && (
                  <div className="border-b border-[var(--app-border)] px-5 py-5">
                    <h4 className="text-sm font-semibold text-[var(--color-ink)]">{report.reportType === "revenue" ? "Daily revenue trend" : "Daily visit trend"}</h4>
                    <div className="mt-4 flex h-36 items-end gap-1 overflow-x-auto border-b border-[var(--app-border)] pb-1">
                      {report.rows.map((row) => {
                        const amount = Number(report.reportType === "revenue" ? row.revenue : row.visits);
                        const maximum = Math.max(1, ...report.rows.map((item) => Number(report.reportType === "revenue" ? item.revenue : item.visits)));
                        const height = Math.max(4, Math.round(amount / maximum * 100));
                        return <div key={String(row.date)} title={`${row.date}: ${report.reportType === "revenue" ? `₱${amount.toFixed(2)}` : `${amount} visits`}`} className="flex h-full min-w-5 flex-1 flex-col justify-end"><div className="rounded-t bg-[var(--app-accent)]/80 hover:bg-[var(--app-accent)]" style={{ height: `${height}%` }} /></div>;
                      })}
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] text-[var(--app-ink-muted)]"><span>{report.rows[0].date}</span><span>{report.rows[report.rows.length - 1].date}</span></div>
                  </div>
                )}
                {report.rows.length === 0 ? <p className="px-5 py-8 text-center text-sm text-[var(--app-ink-muted)]">No report data in this date range.</p> : (
                  <div className="overflow-x-hidden">
                    <table className="admin-responsive-table w-full table-fixed text-left text-sm">
                      <thead className="bg-[var(--app-surface-soft)] text-[10px] font-bold uppercase tracking-wide text-[var(--app-ink-muted)]">
                        <tr>{Object.keys(report.rows[0]).map((key) => <th key={key} className="px-4 py-3">{key.replaceAll(/([A-Z])/g, " $1").replaceAll("_", " ")}</th>)}</tr>
                      </thead>
                      <tbody>
                        {paginatedReportRows.items.map((row, index) => (
                          <tr key={index} className="border-b border-[var(--app-border)]/70 hover:bg-[var(--app-canvas)]">
                            {Object.entries(row).map(([key, value]) => <td key={key} data-label={key.replaceAll(/([A-Z])/g, " $1").replaceAll("_", " ")} className="px-4 py-3 text-[var(--app-ink-muted)]">{key === "noShowRate" && typeof value === "number" ? `${value.toFixed(1)}%` : typeof value === "number" && /revenue|discount|value/i.test(key) ? `₱${value.toFixed(2)}` : value ?? "—"}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {report.rows.length > 0 && (
                  <PaginationControls
                    page={paginatedReportRows.page}
                    totalPages={paginatedReportRows.totalPages}
                    firstItem={paginatedReportRows.firstItem}
                    lastItem={paginatedReportRows.lastItem}
                    totalItems={report.rows.length}
                    onPageChange={setReportPage}
                    label="Report rows"
                  />
                )}
              </section>
            ) : (
              <section className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--app-border)] bg-[var(--app-surface)] px-5 py-12 text-center shadow-[var(--app-shadow)]">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--app-accent-soft)] text-[var(--color-ink)]" aria-hidden="true">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <h3 className="font-semibold text-[var(--color-ink)]">Your report preview will appear here</h3>
                <p className="mt-1 max-w-sm text-sm text-[var(--app-ink-muted)]">Choose a report type and date range, then generate a preview to see your salon data.</p>
              </section>
            )}
          </div>
        )}

        {module === "backup-restore" && (
          <div className="mt-2 flex min-h-0 flex-1 flex-col gap-3">
            <header className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="font-display text-xl font-semibold text-[var(--color-ink)]">Backup &amp; restore</h2>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--app-ink-muted)]">
                  Download a backup or restore saved data. Sign-in credentials are never included.
                </p>
              </div>
              <span className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-semibold ${
                backupFilesAvailable === null
                  ? "bg-[var(--app-surface-soft)] text-[var(--app-ink-muted)]"
                  : backupFilesAvailable
                    ? "bg-success-soft text-success"
                    : "bg-clay-light text-clay"
              }`}>
                <span className={`h-2 w-2 rounded-full ${
                  backupFilesAvailable === null
                    ? "bg-[var(--app-ink-muted)]"
                    : backupFilesAvailable
                      ? "bg-success"
                      : "bg-clay"
                }`} aria-hidden="true" />
                {backupFilesAvailable === null
                  ? "Checking backup drive…"
                  : backupFilesAvailable
                    ? "Backup drive connected"
                    : "Backup drive not connected"}
              </span>
            </header>

            <div className="grid min-h-0 flex-1 items-stretch gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(19rem,0.9fr)]">
              <section aria-labelledby="backup-actions-title" className="flex min-h-0 flex-col rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 shadow-[var(--app-shadow)] sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--app-accent)]">Backup manager</p>
                    <h3 id="backup-actions-title" className="mt-0.5 font-display text-lg font-semibold text-[var(--color-ink)]">Manage your data</h3>
                  </div>
                  <div role="tablist" aria-label="Backup actions" className="flex rounded-full bg-[var(--app-surface-soft)] p-1">
                    <button type="button" role="tab" aria-selected={backupMode === "download"} onClick={() => setBackupMode("download")} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${backupMode === "download" ? "bg-[var(--app-accent)] text-white shadow-sm" : "text-[var(--app-ink-muted)]"}`}>Download backup</button>
                    <button type="button" role="tab" aria-selected={backupMode === "restore"} onClick={() => setBackupMode("restore")} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${backupMode === "restore" ? "bg-[var(--app-accent)] text-white shadow-sm" : "text-[var(--app-ink-muted)]"}`}>Restore file</button>
                  </div>
                </div>

                {backupMode === "download" ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--app-canvas)] px-3 py-3">
                    <div className="flex items-start gap-2">
                      <Download className="mt-0.5 h-4 w-4 shrink-0 text-[var(--app-accent)]" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-semibold text-[var(--color-ink)]">Create a fresh backup</p>
                        <p className="mt-0.5 text-xs leading-4 text-[var(--app-ink-muted)]">Download a complete JSON backup.</p>
                      </div>
                    </div>
                    <button type="button" disabled={isSaving} onClick={() => setShowBackupConfirmation(true)} className="inline-flex min-h-9 items-center gap-2 rounded-full bg-[var(--app-accent)] px-4 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50">
                      <Download className="h-4 w-4" aria-hidden="true" />
                      {isSaving ? "Preparing…" : "Download backup"}
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl bg-[var(--app-canvas)] px-3 py-3">
                    <p className="text-sm font-semibold text-[var(--color-ink)]">Restore from a backup file</p>
                    <p className="mt-0.5 text-xs leading-4 text-[var(--app-ink-muted)]">Replaces saved data. Sign-in credentials stay unchanged.</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full bg-[var(--app-accent-soft)] px-4 text-xs font-semibold text-[var(--app-accent)] transition hover:opacity-80">
                        <Upload className="h-4 w-4" aria-hidden="true" />
                        {backupFile ? "Choose another file" : "Choose file"}
                        <input type="file" accept="application/json,.json" disabled={isSaving} onChange={(event) => {
                          void handleBackupFileChange(event.target.files?.[0] ?? null);
                          event.target.value = "";
                        }} className="sr-only" />
                      </label>
                      {backupFile && (
                        <span className="min-w-0 text-xs text-[var(--app-ink-muted)]">
                          {backupFile.name} · {(backupFile.size / 1024 / 1024).toFixed(2)} MB
                        </span>
                      )}
                      {backupFile && (
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => setShowRestoreConfirmation(true)}
                          className="min-h-9 rounded-full border border-[var(--app-border)] px-4 text-xs font-semibold text-[var(--color-ink)] transition hover:bg-[var(--app-surface-soft)] disabled:opacity-50"
                        >
                          Review restore
                        </button>
                      )}
                    </div>
                    {backupRestorePreview && (
                      <ul aria-label="Selected backup contents" className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] leading-4 text-[var(--app-ink-muted)] sm:grid-cols-4">
                        {BACKUP_SUMMARY_GROUPS.map(({ label }) => (
                          <li key={label} className="truncate">{label}: {backupRestorePreview.recordCounts[label]}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <div className="mt-auto grid grid-cols-2 gap-3 pt-4 sm:grid-cols-4">
                  {[
                    { label: "Records", value: backupSummaryCounts ? totalBackupRecords.toLocaleString() : "—" },
                    { label: "USB snapshots", value: isLoading ? "…" : backupFiles.length.toString() },
                    { label: "Schedule", value: backupSchedule?.enabled ? "4 cycles" : "Off" },
                    { label: "Latest export", value: latestExport ? new Date(latestExport.created_at).toLocaleDateString() : "None yet" },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2.5">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-[var(--app-ink-muted)]">{label}</p>
                      <p className="mt-1 truncate font-display text-base font-semibold text-[var(--color-ink)]">{value}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[10px] leading-4 text-[var(--app-ink-muted)]">
                  {downloadState.status === "running"
                    ? "Preparing backup…"
                    : "Counts are from the latest export."}
                </p>
              </section>

              <section aria-labelledby="recent-backups-title" className="flex min-h-0 flex-col rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 shadow-[var(--app-shadow)] sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--app-ink-muted)]">Snapshots</p>
                    <h3 id="recent-backups-title" className="mt-0.5 font-display text-lg font-semibold text-[var(--color-ink)]">Recent backups</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-[var(--app-accent-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--app-accent)]">{backupFiles.length} files</span>
                    <button type="button" onClick={() => void loadModule(false)} aria-label="Refresh backup files" className="rounded-full border border-[var(--app-border)] p-2 text-[var(--app-ink-muted)] hover:bg-[var(--app-surface-soft)]">
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <HardDriveDownload className="h-5 w-5 text-[var(--app-accent)]" aria-hidden="true" />
                  </div>
                </div>
                {isLoading ? (
                  <p className="py-4 text-xs text-[var(--app-ink-muted)]">Loading saved backups…</p>
                ) : !backupFilesAvailable ? (
                  <div className="mt-3 rounded-xl border border-dashed border-[var(--app-border)] px-3 py-4 text-center">
                    <p className="text-xs font-medium text-[var(--color-ink)]">Backup destination unavailable</p>
                    <p className="mt-1 text-[10px] leading-4 text-[var(--app-ink-muted)]">{backupFilesMessage ?? "Connect the backup drive or check the API folder."}</p>
                  </div>
                ) : backupFiles.length === 0 ? (
                  <div className="mt-3 rounded-xl border border-dashed border-[var(--app-border)] px-3 py-4 text-center">
                    <p className="text-xs font-medium text-[var(--color-ink)]">No scheduled snapshot files found</p>
                    <p className="mt-1 text-[10px] leading-4 text-[var(--app-ink-muted)]">A snapshot will appear after the next scheduled backup.</p>
                  </div>
                ) : (
                  <ul className="mt-2 divide-y divide-[var(--app-border)]">
                    {backupFiles.slice(0, 3).map((file) => (
                      <li key={file.fileName} className="flex items-center justify-between gap-2 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-[var(--color-ink)]">{file.fileName}</p>
                          <p className="mt-0.5 text-[10px] text-[var(--app-ink-muted)]">{file.cadence} · {formatFileSize(file.size)} · {new Date(file.createdAt).toLocaleDateString()}</p>
                        </div>
                        <button type="button" disabled={savingBackupFile !== null} onClick={() => void saveScheduledBackup(file)} aria-label={`Save ${file.fileName}`} className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-[var(--app-border)] px-3 text-[10px] font-semibold text-[var(--color-ink)] hover:bg-[var(--app-surface-soft)] disabled:opacity-50">
                          <Download className="h-3.5 w-3.5" aria-hidden="true" />
                          {savingBackupFile === file.fileName ? "Saving…" : "Save"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-auto border-t border-[var(--app-border)] pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-xs font-semibold text-[var(--color-ink)]">Recent activity</h4>
                    <span className="text-[10px] text-[var(--app-ink-muted)]">{backupHistory.length} records</span>
                  </div>
                  {backupHistory.length === 0 ? (
                    <p className="mt-2 text-[10px] text-[var(--app-ink-muted)]">No backup activity yet.</p>
                  ) : (
                    <>
                      <ol className="mt-1 space-y-1">
                        {paginatedBackupHistory.items.map((item) => (
                          <li key={item.id} className="flex items-center justify-between gap-3 text-[10px]">
                            <span className="font-medium text-[var(--color-ink)]">{item.action === "export" ? "Backup exported" : "Backup restored"}</span>
                            <time className="shrink-0 text-[var(--app-ink-muted)]" dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>
                          </li>
                        ))}
                      </ol>
                      {backupHistory.length > 3 && <div className="mt-1 flex items-center justify-end gap-2 text-[10px] text-[var(--app-ink-muted)]"><button type="button" disabled={paginatedBackupHistory.page <= 1} onClick={() => setBackupPage((page) => page - 1)} className="disabled:opacity-40">Previous</button><span>{paginatedBackupHistory.page}/{paginatedBackupHistory.totalPages}</span><button type="button" disabled={paginatedBackupHistory.page >= paginatedBackupHistory.totalPages} onClick={() => setBackupPage((page) => page + 1)} className="disabled:opacity-40">Next</button></div>}
                    </>
                  )}
                </div>
              </section>
            </div>

            <section aria-labelledby="operational-reset-title" className="rounded-2xl border border-clay/40 bg-[var(--app-surface)] p-4 shadow-[var(--app-shadow)] sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-clay">Destructive action</p>
                  <h3 id="operational-reset-title" className="mt-0.5 font-display text-lg font-semibold text-[var(--color-ink)]">Clear transactions and staff accounts</h3>
                  <p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--app-ink-muted)]">
                    Removes staff and customer sign-in accounts, customer records and tags, promotions and redemptions, queue/service transactions, duration and model history, and package balances. Service durations are cleared; admin accounts, the service catalog and prices, configured service chairs, and service packages stay.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isSaving || isLoading || !operationalResetPreview?.hasRecentBackup}
                  onClick={() => {
                    setOperationalResetConfirmation("");
                    setShowOperationalResetConfirmation(true);
                  }}
                  className="min-h-9 shrink-0 rounded-full bg-clay px-4 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Review reset
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[var(--app-ink-muted)]">
                <span>{operationalResetPreview?.staff.length ?? 0} staff accounts</span>
                <span>
                  {operationalResetPreview?.hasRecentBackup
                    ? `Fresh backup exported ${operationalResetPreview.exportedAt
                      ? new Date(operationalResetPreview.exportedAt).toLocaleString()
                      : "recently"}`
                    : "Download a fresh backup to enable reset"}
                </span>
              </div>
            </section>

            <footer className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-2.5 text-[10px]">
              <div className="flex items-center gap-2">
                <span className="text-[var(--app-ink-muted)]">{backupSchedule?.enabled ? `Daily · weekly · monthly · yearly at ${backupSchedule.time} ${backupSchedule.timeZone}` : "Set LYNQ_BACKUP_DIR on the API computer for scheduled backups."}</span>
              </div>
              {backupSchedule?.enabled && <span className="text-[var(--app-ink-muted)]">Retention: {backupSchedule.retention.daily} daily / {backupSchedule.retention.weekly} weekly / {backupSchedule.retention.monthly} monthly / {backupSchedule.retention.yearly} yearly</span>}
              {backupSchedule?.lastRunAt && <span className="text-[var(--app-ink-muted)]">{backupSchedule.lastRunMessage} <time dateTime={backupSchedule.lastRunAt}>{new Date(backupSchedule.lastRunAt).toLocaleString()}</time></span>}
            </footer>
            {showBackupConfirmation && (
              <div className="fixed inset-0 z-[130] flex items-center justify-center bg-ink/45 p-4" role="presentation">
                <section
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="backup-confirmation-title"
                  className="w-full max-w-lg rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-2xl sm:p-6"
                >
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--app-accent)]">Full operational backup</p>
                  <h3 id="backup-confirmation-title" className="mt-1 font-display text-xl font-semibold text-[var(--color-ink)]">
                    Create and download this backup?
                  </h3>
                  <p className="mt-2 text-sm leading-5 text-[var(--app-ink-muted)]">
                    The backup will contain:
                  </p>
                  <ul className="mt-3 grid gap-1.5 text-sm text-[var(--color-ink)] sm:grid-cols-2">
                    {BACKUP_SUMMARY_GROUPS.map(({ label }) => <li key={label}>{label}</li>)}
                  </ul>
                  <p className="mt-3 text-xs leading-5 text-[var(--app-ink-muted)]">
                    Sign-in credentials and external-provider secrets are never included. Staff/customer sign-in identities are not created or replaced by a restore. A percentage tracks data transfer when the browser reports its size; the browser manages the final file save and its location.
                  </p>
                  <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={() => setShowBackupConfirmation(false)}
                      className="min-h-10 rounded-lg border border-[var(--app-border)] px-4 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--app-surface-soft)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => void exportBackup()}
                      className="min-h-10 rounded-lg bg-[var(--app-accent)] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                    >
                      Confirm backup
                    </button>
                  </div>
                </section>
              </div>
            )}
            {showRestoreConfirmation && backupFile && backupRestorePreview && (
              <div className="fixed inset-0 z-[130] flex items-center justify-center bg-ink/45 p-4" role="presentation">
                <section
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="restore-confirmation-title"
                  className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-2xl sm:p-6"
                >
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--app-accent)]">Restore backup</p>
                  <h3 id="restore-confirmation-title" className="mt-1 font-display text-xl font-semibold text-[var(--color-ink)]">
                    Replace data with this backup?
                  </h3>
                  <p className="mt-2 break-all text-sm text-[var(--app-ink-muted)]">
                    {backupFile.name} · {(backupFile.size / 1024 / 1024).toFixed(2)} MB
                    {backupRestorePreview.exportedAt && ` · Created ${backupRestorePreview.exportedAt}`}
                  </p>
                  <p className="mt-3 text-sm leading-5 text-[var(--app-ink-muted)]">
                    The selected file contains:
                  </p>
                  <ul className="mt-2 grid gap-1.5 text-sm text-[var(--color-ink)] sm:grid-cols-2">
                    {BACKUP_SUMMARY_GROUPS.map(({ label }) => (
                      <li key={label}>{label}: {backupRestorePreview.recordCounts[label]}</li>
                    ))}
                  </ul>
                  <p className="mt-3 rounded-lg bg-clay-light px-3 py-2 text-xs leading-5 text-clay">
                    This replaces all backed-up operational data. Authentication credentials and provider secrets are excluded; restoring profile records requires their existing sign-in identities to remain available.
                  </p>
                  <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => setShowRestoreConfirmation(false)}
                      className="min-h-10 rounded-lg border border-[var(--app-border)] px-4 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--app-surface-soft)] disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => void restoreBackup()}
                      className="min-h-10 rounded-lg bg-clay px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {isSaving ? "Restoring…" : "Replace data and restore"}
                    </button>
                  </div>
                </section>
              </div>
            )}
            {showOperationalResetConfirmation && operationalResetPreview && (
              <div className="fixed inset-0 z-[130] flex items-center justify-center bg-ink/45 p-4" role="presentation">
                <section
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="operational-reset-confirmation-title"
                  className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-2xl sm:p-6"
                >
                  <p className="text-xs font-bold uppercase tracking-wider text-clay">Permanent data deletion</p>
                  <h3 id="operational-reset-confirmation-title" className="mt-1 font-display text-xl font-semibold text-[var(--color-ink)]">
                    Clear operational history and delete staff accounts?
                  </h3>
                  <p className="mt-2 text-sm leading-5 text-[var(--app-ink-muted)]">
                    This cannot be undone. Staff credentials are not included in backups and deleted accounts must be recreated manually.
                  </p>
                  <div className="mt-3 rounded-xl bg-[var(--app-canvas)] p-3">
                    <p className="text-xs font-semibold text-[var(--color-ink)]">Staff accounts to delete</p>
                    {operationalResetPreview.staff.length === 0 ? (
                      <p className="mt-1 text-xs text-[var(--app-ink-muted)]">No staff accounts.</p>
                    ) : (
                      <ul className="mt-1 grid gap-x-3 gap-y-1 text-xs text-[var(--app-ink-muted)] sm:grid-cols-2">
                        {operationalResetPreview.staff.map((staff) => (
                          <li key={staff.username} className="truncate">{staff.fullName} ({staff.username})</li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-3 text-xs font-semibold text-[var(--color-ink)]">Records to clear</p>
                    <ul className="mt-1 grid max-h-32 gap-x-3 gap-y-1 overflow-y-auto text-xs text-[var(--app-ink-muted)] sm:grid-cols-2">
                      {Object.entries(operationalResetPreview.counts).map(([table, count]) => (
                        <li key={table} className="flex justify-between gap-2">
                          <span>{table.replace(/_/g, " ")}</span>
                          <span className="font-semibold tabular-nums">{count.toLocaleString()}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <p className="mt-3 rounded-lg bg-clay-light px-3 py-2 text-xs leading-5 text-clay">
                    Preserved: {operationalResetPreview.preserved.join(", ")}.
                    {" "}Package balances and promotion-redemption history will be deleted too.
                  </p>
                  <label className="mt-4 block text-xs font-semibold text-[var(--color-ink)]">
                    Type <span className="font-mono">{operationalResetPreview.confirmationPhrase}</span> to continue
                    <input
                      type="text"
                      autoComplete="off"
                      value={operationalResetConfirmation}
                      onChange={(event) => setOperationalResetConfirmation(event.target.value)}
                      className="dashboard-filter-control mt-1 w-full text-ink"
                    />
                  </label>
                  <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => setShowOperationalResetConfirmation(false)}
                      className="min-h-10 rounded-lg border border-[var(--app-border)] px-4 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--app-surface-soft)] disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isSaving || !operationalResetPreview.hasRecentBackup || operationalResetConfirmation !== operationalResetPreview.confirmationPhrase}
                      onClick={() => void resetOperationalData()}
                      className="min-h-10 rounded-lg bg-clay px-4 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSaving ? "Clearing data…" : "Delete accounts and clear data"}
                    </button>
                  </div>
                </section>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
