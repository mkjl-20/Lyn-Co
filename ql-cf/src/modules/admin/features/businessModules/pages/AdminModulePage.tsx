import { lazy, Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useParams } from "react-router-dom";
import { apiRequest } from "@/shared/lib/apiClient";
import { AdminSettingsPage } from "../../settings/pages/AdminSettingsPage";
import { StatusBadge } from "@/shared/components/StatusBadge";

const AdminBusinessModules = lazy(async () => {
  const module = await import("./AdminBusinessModules");
  return { default: module.AdminBusinessModules };
});

interface ServiceRow {
  id: string;
  category: string | null;
  name: string;
  description: string | null;
  price: number;
  price_type: "fixed" | "starting";
  duration_minutes: number | null;
  is_visible: boolean;
  is_available: boolean;
}

function removeDuplicateServices(services: ServiceRow[]): ServiceRow[] {
  const seen = new Set<string>();
  return services.filter((service) => {
    const key = `${service.name.trim().toLocaleLowerCase()}::${(service.category ?? "Other").trim().toLocaleLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const MODULES: Record<string, { title: string; areas: string[] }> = {
  "service-catalog": { title: "Service Catalog Management", areas: ["Services", "Pricing", "Customer visibility"] },
  "customer-tagging": { title: "VIP & Customer Tagging", areas: ["VIP list", "Customer tags", "Tagging rules"] },
  "promotions-events": { title: "Promotions", areas: ["Create promotions", "Set discount rules", "Schedule active dates"] },
  "pos-transactions": { title: "POS Checkout", areas: ["Completed-ticket checkout"] },
  "settings-branding": { title: "Settings & Branding", areas: ["Salon information", "Logo, theme & queue QR code", "Business hours and alerts"] },
  "forecasting": { title: "Forecasting & Predictive Analytics", areas: ["Peak-hour and seasonal forecasts", "Staffing recommendations", "Forecast accuracy and model data"] },
  "reports": { title: "Reports", areas: ["Queue reports", "Revenue reports", "Staff reports"] },
  "audit-logs": { title: "Audit Logs", areas: ["Administrative activity", "Payments", "Backup events"] },
  "backup-restore": { title: "Backup & Restore", areas: ["Export admin data", "Backup history", "Restore data"] },
};

function isBusinessModule(
  module: string | undefined
): module is "customer-tagging" | "promotions-events" | "pos-transactions" | "reports" | "backup-restore" | "audit-logs" {
  return module === "customer-tagging"
    || module === "promotions-events"
    || module === "pos-transactions"
    || module === "reports"
    || module === "backup-restore"
    || module === "audit-logs";
}

export function AdminModulePage() {
  const { module } = useParams();
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [serviceSearch, setServiceSearch] = useState("");
  const [serviceCategory, setServiceCategory] = useState("all");
  const [serviceVisibility, setServiceVisibility] = useState("all");
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [isCreatingService, setIsCreatingService] = useState(false);
  const [newService, setNewService] = useState({
    name: "",
    category: "",
    price: "0",
    duration_minutes: "30",
  });
  const [openServiceMenuId, setOpenServiceMenuId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<ServiceRow>>({});
  const [savingServiceId, setSavingServiceId] = useState<string | null>(null);
  const config = MODULES[module ?? ""] ?? { title: "Admin module", areas: ["Module workspace"] };
  const visibleServices = services.filter((service) => {
    const query = serviceSearch.trim().toLowerCase();
    const matchesSearch = !query || `${service.name} ${service.category ?? ""}`.toLowerCase().includes(query);
    const matchesCategory = serviceCategory === "all" || (service.category ?? "General") === serviceCategory;
    const matchesVisibility = serviceVisibility === "all" || (serviceVisibility === "visible" ? service.is_visible && service.is_available : !service.is_visible || !service.is_available);
    return matchesSearch && matchesCategory && matchesVisibility;
  });
  const serviceCategories = Array.from(new Set(services.map((service) => service.category ?? "General"))).sort();
  const servicesByCategory = visibleServices.reduce<Record<string, ServiceRow[]>>((groups, service) => {
    const category = service.category ?? "General";
    groups[category] ??= [];
    groups[category].push(service);
    return groups;
  }, {});

  useEffect(() => {
    if (module !== "service-catalog") return;

    let mounted = true;
    setServicesLoading(true);
    setServicesError(null);

    void apiRequest<{ services: ServiceRow[] }>("/api/admin/workspace/services")
      .then(({ services: data }) => {
        if (mounted) setServices(removeDuplicateServices(data));
      })
      .catch((error: unknown) => {
        if (mounted) setServicesError(error instanceof Error ? error.message : "Unable to load services.");
      })
      .finally(() => {
        if (mounted) setServicesLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [module]);

  function startEditing(service: ServiceRow) {
    setEditingServiceId(service.id);
    setEditForm(service);
    setServicesError(null);
  }

  function cancelEditing() {
    setEditingServiceId(null);
    setEditForm({});
  }

  async function saveService() {
    if (!editingServiceId) return;
    setSavingServiceId(editingServiceId);
    setServicesError(null);

    try {
      const { service } = await apiRequest<{ service: ServiceRow }>(`/api/admin/workspace/services/${editingServiceId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editForm.name?.trim(),
          category: editForm.category?.trim() || null,
          price: Number(editForm.price),
          durationMinutes: editForm.duration_minutes ?? undefined,
          isVisible: editForm.is_visible,
          isAvailable: editForm.is_available,
        })
      });
      setServices((current) => current.map((serviceItem) => serviceItem.id === editingServiceId ? service : serviceItem));
      cancelEditing();
    } catch (error) {
      setServicesError(error instanceof Error ? error.message : "Unable to save the service.");
    } finally {
      setSavingServiceId(null);
    }
  }

  async function createService() {
    const name = newService.name.trim();
    const price = Number(newService.price);
    const duration = Number(newService.duration_minutes);
    if (!name || !Number.isFinite(price) || price < 0 || !Number.isInteger(duration) || duration < 1) {
      setServicesError("Enter a service name, a non-negative price, and a duration of at least one minute.");
      return;
    }

    setSavingServiceId("new");
    setServicesError(null);
    try {
      const { service } = await apiRequest<{ service: ServiceRow }>("/api/admin/workspace/services", {
        method: "POST",
        body: JSON.stringify({
          name,
          category: newService.category.trim() || null,
          price,
          durationMinutes: duration,
          priceType: "fixed",
        })
      });
      setServices((current) => removeDuplicateServices([...current, service]));
      setNewService({ name: "", category: "", price: "0", duration_minutes: "30" });
      setIsCreatingService(false);
    } catch (error) {
      setServicesError(error instanceof Error ? error.message : "Unable to add the service.");
    } finally {
      setSavingServiceId(null);
    }
  }

  if (module === "settings-branding") return <AdminSettingsPage />;

  const isAuditLogs = module === "audit-logs";
  const isBackupRestore = module === "backup-restore";
  const isBusinessWorkspace = isBusinessModule(module);
  return (
    <main className={`pastel-pink-gradient-page text-ink ${
      isBusinessWorkspace
        ? "h-full min-h-0 overflow-hidden p-0"
        : isAuditLogs ? "h-full min-h-0 overflow-hidden px-3 py-3 sm:px-4 sm:py-4" : "h-full min-h-0 overflow-hidden p-3 sm:p-5"
    }`}>
      <div className={`mx-auto h-full min-h-0 ${isBusinessWorkspace ? "overflow-hidden" : "overflow-y-auto pb-10"} ${isAuditLogs ? "max-w-none" : "max-w-6xl"} ${isBackupRestore ? "flex flex-col" : ""}`}>
        {module === "service-catalog" ? (
          <section className="mt-2 overflow-hidden rounded-2xl border border-mist bg-white shadow-sm">
            <div className="border-b border-mist px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-ink">Customer services</h2>
                <button
                  type="button"
                  onClick={() => {
                    setNewService({ name: "", category: "", price: "0", duration_minutes: "30" });
                    setEditForm({});
                    setEditingServiceId(null);
                    setIsCreatingService(true);
                  }}
                  className="dashboard-primary-action inline-flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                  </svg>
                  Add service
                </button>
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input value={serviceSearch} onChange={(event) => setServiceSearch(event.target.value)} placeholder="Search services..." className="dashboard-filter-control w-full outline-none focus:border-sage sm:max-w-xs" aria-label="Search services" />
                <select value={serviceCategory} onChange={(event) => setServiceCategory(event.target.value)} className="dashboard-filter-control min-w-40 outline-none focus:border-sage" aria-label="Filter service category"><option value="all">All categories</option>{serviceCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select>
                <select value={serviceVisibility} onChange={(event) => setServiceVisibility(event.target.value)} className="dashboard-filter-control min-w-40 outline-none focus:border-sage" aria-label="Filter service visibility"><option value="all">All statuses</option><option value="visible">Customer visible</option><option value="hidden">Hidden</option></select>
              </div>
            </div>
            {servicesLoading && <p className="px-5 py-8 text-sm text-ink/50">Loading services...</p>}
            {servicesError && <p role="alert" className="px-5 py-8 text-sm text-clay">{servicesError}</p>}
            {!servicesLoading && !servicesError && visibleServices.length === 0 && <p className="px-5 py-8 text-sm text-ink/50">No matching services.</p>}
            {!servicesLoading && !servicesError && visibleServices.length > 0 && (
              <div className="max-h-[min(65dvh,48rem)] overflow-y-auto">
                {Object.entries(servicesByCategory).sort(([first], [second]) => first.localeCompare(second)).map(([category, categoryServices]) => (
                  <div key={category}>
                    <div className="border-b border-mist bg-porcelain px-5 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-ink/45">{category}</div>
                    <div className="hidden grid-cols-[minmax(0,1fr)_7rem_6rem_7rem_2rem] gap-3 border-b border-mist bg-white px-5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-ink/40 sm:grid"><span>Service</span><span>Category</span><span>Price</span><span>Status</span><span /></div>
                    <div className="divide-y divide-mist">
                    {categoryServices.map((service) => (
                    <div key={service.id} className="px-5 py-4 transition-colors hover:bg-porcelain/50">
                      <div className="grid gap-3 text-sm sm:grid-cols-[minmax(0,1fr)_7rem_6rem_7rem_2rem] sm:items-center"><div className="min-w-0"><p className="font-semibold text-ink">{service.name}</p><p className="mt-1 text-xs text-ink/45">{service.duration_minutes === null ? "Duration not set" : `${service.duration_minutes} min`}</p></div><p className="text-sm text-ink/60">{service.category || "General"}</p><p className="font-semibold text-ink">₱{Number(service.price).toLocaleString()}</p><StatusBadge status={service.is_visible && service.is_available ? "available" : "hidden"} className="w-fit px-2 py-0.5 text-[10px]">{service.is_visible && service.is_available ? "Visible" : "Hidden"}</StatusBadge><div className="relative">
                        <button type="button" onClick={() => setOpenServiceMenuId((current) => current === service.id ? null : service.id)} aria-label={`Options for ${service.name}`} title="Service options" className="dashboard-icon-control flex h-9 w-9 items-center justify-center text-ink/50 transition-colors hover:text-ink">
                          <span className="h-1 w-1 rounded-full bg-current" />
                          <span className="h-1 w-1 rounded-full bg-current" />
                          <span className="h-1 w-1 rounded-full bg-current" />
                        </button>
                        {openServiceMenuId === service.id && <div className="absolute right-0 top-8 z-10 w-28 rounded-lg border border-mist bg-white p-1 shadow-lg"><button type="button" onClick={() => { startEditing(service); setOpenServiceMenuId(null); }} className="ui-action-edit w-full rounded px-2 py-2 text-left text-xs">Edit</button></div>}
                      </div></div>
                    </div>
                    ))}
                    <div aria-hidden="true" className="h-8 bg-gray-100" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {(isCreatingService || editingServiceId !== null) && (
              createPortal(<div className="fixed inset-0 z-[1000] flex items-end justify-center bg-ink/35 p-0 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) { setIsCreatingService(false); cancelEditing(); } }}>
                <section role="dialog" aria-modal="true" aria-labelledby="service-dialog-title" className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-[var(--app-border)] bg-white p-5 shadow-2xl sm:max-w-xl sm:rounded-2xl sm:p-6">
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sage-deep">Service catalog</p>
                      <h2 id="service-dialog-title" className="mt-1 font-display text-xl font-semibold text-ink">{editingServiceId ? "Edit service" : "Add service"}</h2>
                    </div>
                    <button type="button" aria-label="Close dialog" onClick={() => { setIsCreatingService(false); cancelEditing(); }} className="dashboard-icon-control flex h-9 w-9 items-center justify-center text-ink/65 transition-colors hover:text-ink">×</button>
                  </div>
                  <form onSubmit={(event) => { event.preventDefault(); if (editingServiceId) void saveService(); else void createService(); }} className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-medium text-ink/65 sm:col-span-2">Service name<input required maxLength={100} autoFocus value={editingServiceId ? editForm.name ?? "" : newService.name} onChange={(event) => editingServiceId ? setEditForm((current) => ({ ...current, name: event.target.value })) : setNewService((current) => ({ ...current, name: event.target.value }))} className="mt-1 w-full rounded-lg border border-mist bg-white px-3 text-sm text-ink" /></label>
                    <label className="text-xs font-medium text-ink/65">Category<input required maxLength={60} value={editingServiceId ? editForm.category ?? "" : newService.category} onChange={(event) => editingServiceId ? setEditForm((current) => ({ ...current, category: event.target.value })) : setNewService((current) => ({ ...current, category: event.target.value }))} className="mt-1 w-full rounded-lg border border-mist bg-white px-3 text-sm text-ink" /></label>
                    <label className="text-xs font-medium text-ink/65">Price<input required type="number" min="0" step="0.01" value={editingServiceId ? editForm.price ?? "" : newService.price} onChange={(event) => editingServiceId ? setEditForm((current) => ({ ...current, price: Number(event.target.value) })) : setNewService((current) => ({ ...current, price: event.target.value }))} className="mt-1 w-full rounded-lg border border-mist bg-white px-3 text-sm text-ink" /></label>
                    <label className="text-xs font-medium text-ink/65">Duration in minutes<input required={!editingServiceId} type="number" min="1" step="1" placeholder={editingServiceId ? "Not set" : undefined} value={editingServiceId ? editForm.duration_minutes ?? "" : newService.duration_minutes} onChange={(event) => editingServiceId ? setEditForm((current) => ({ ...current, duration_minutes: event.target.value ? Number(event.target.value) : null })) : setNewService((current) => ({ ...current, duration_minutes: event.target.value }))} className="mt-1 w-full rounded-lg border border-mist bg-white px-3 text-sm text-ink" /></label>
                    {editingServiceId && <div className="flex items-center gap-5 text-sm text-ink/70"><label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(editForm.is_visible)} onChange={(event) => setEditForm((current) => ({ ...current, is_visible: event.target.checked }))} /> Visible</label><label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(editForm.is_available)} onChange={(event) => setEditForm((current) => ({ ...current, is_available: event.target.checked }))} /> Available</label></div>}
                    <div className="flex flex-col-reverse gap-2 pt-2 sm:col-span-2 sm:flex-row sm:justify-end">
                      <button type="button" onClick={() => { setIsCreatingService(false); cancelEditing(); }} className="form-cancel-action rounded-lg px-4 text-sm font-semibold">Cancel</button>
                      <button type="submit" disabled={savingServiceId !== null} className="dashboard-primary-action rounded-lg px-4 text-sm font-semibold disabled:opacity-50">{savingServiceId ? "Saving..." : editingServiceId ? "Save changes" : "Add service"}</button>
                    </div>
                  </form>
                </section>
              </div>, document.body)
            )}
          </section>
        ) : isBusinessModule(module) ? (
          <Suspense fallback={<div className="mt-6 rounded-2xl border border-mist bg-white p-6 text-sm text-ink/60" role="status">Loading workspace…</div>}>
            <AdminBusinessModules
              key={module}
              module={module}
              showPaymentHistory={module !== "pos-transactions"}
            />
          </Suspense>
        ) : (
          <section className="mt-6 grid gap-3 sm:grid-cols-3">
            {config.areas.map((area) => (
              <div key={area} className="rounded-xl border border-mist bg-white p-5">
                <p className="text-sm font-semibold text-ink">{area}</p>
              </div>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
