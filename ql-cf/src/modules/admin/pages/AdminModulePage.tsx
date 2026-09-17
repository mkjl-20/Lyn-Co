import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabaseClient } from "@/shared/lib/supabaseClient";

interface ServiceRow {
  id: string;
  category: string | null;
  name: string;
  description: string | null;
  price: number;
  price_type: "fixed" | "starting";
  duration_minutes: number;
  is_visible: boolean;
  is_available: boolean;
}

const MODULES: Record<string, { title: string; summary: string; areas: string[] }> = {
  "service-catalog": { title: "Service Catalog Management", summary: "Manage salon services, prices, and customer visibility.", areas: ["Services", "Pricing", "Customer visibility"] },
  "customer-tagging": { title: "VIP & Customer Tagging", summary: "Manage VIP customers and customer type information.", areas: ["VIP list", "Customer tags", "Tagging rules"] },
  "promotions-events": { title: "Promotions & Events", summary: "Coordinate offers, holidays, and events that affect salon operations.", areas: ["Active promotions", "Holiday calendar", "Forecast events"] },
  "pos-transactions": { title: "POS & Transactions", summary: "Review revenue, payments, refunds, and transaction approvals.", areas: ["Transactions", "Revenue by service", "Refunds and voids"] },
  "settings-branding": { title: "Settings & Branding", summary: "Configure the salon identity, business rules, and operating preferences.", areas: ["Salon information", "Business hours", "Branding and thresholds"] },
  "forecasting": { title: "Forecasting & Predictive Analytics", summary: "Review forecasts and staffing recommendations.", areas: ["Peak-hour forecasts", "Staffing recommendations", "What-if scenarios"] },
  "reports": { title: "Reports", summary: "Prepare printable operational reports.", areas: ["Queue reports", "Revenue reports", "Staff reports"] },
  "backup-restore": { title: "Backup & Restore", summary: "Manage data recovery workflows.", areas: ["Scheduled backups", "Backup history", "Restore data"] },
  "system-architecture": { title: "System Architecture & Engineering Specifications", summary: "Modular 3-tier client-server architecture, runtime specifications, and analytical models.", areas: ["Presentation Layer", "Application Layer", "Data Layer"] },
};

export function AdminModulePage() {
  const { module } = useParams();
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [serviceSearch, setServiceSearch] = useState("");
  const [serviceCategory, setServiceCategory] = useState("all");
  const [serviceVisibility, setServiceVisibility] = useState("all");
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [openServiceMenuId, setOpenServiceMenuId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<ServiceRow>>({});
  const [savingServiceId, setSavingServiceId] = useState<string | null>(null);
  const config = MODULES[module ?? ""] ?? { title: "Admin module", summary: "Manage this area of LynQ administration.", areas: ["Module workspace"] };
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

    supabaseClient
      .from("services")
      .select("id, category, name, description, price, price_type, duration_minutes, is_visible, is_available")
      .order("display_order", { ascending: true })
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error) {
          setServicesError(error.message);
        } else {
          setServices((data ?? []) as ServiceRow[]);
        }
        setServicesLoading(false);
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

    const { data, error } = await supabaseClient
      .from("services")
      .update({
        name: editForm.name?.trim(),
        category: editForm.category?.trim() || null,
        price: Number(editForm.price),
        duration_minutes: Number(editForm.duration_minutes),
        is_visible: editForm.is_visible,
        is_available: editForm.is_available,
      })
      .eq("id", editingServiceId)
      .select("id, category, name, description, price, price_type, duration_minutes, is_visible, is_available")
      .single();

    if (error) {
      setServicesError(error.message);
    } else {
      setServices((current) => current.map((service) => service.id === editingServiceId ? data as ServiceRow : service));
      cancelEditing();
    }
    setSavingServiceId(null);
  }

  return (
    <main className="min-h-screen bg-[#eef1ed] p-5 text-ink sm:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="border-b border-[#cfd7d0] pb-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sage-deep">Admin workspace</p>
          <h1 className="mt-1 font-display text-2xl text-ink">{config.title}</h1>
        </div>
        {module === "service-catalog" ? (
          <section className="mt-6 overflow-hidden border border-[#d9dfd9] bg-white">
            <div className="border-b border-[#e1e6e1] px-5 py-4">
              <h2 className="text-sm font-semibold text-ink">Customer services</h2>
              <p className="mt-1 text-xs text-ink/45">Live catalog used by the customer join form.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input value={serviceSearch} onChange={(event) => setServiceSearch(event.target.value)} placeholder="Search services..." className="w-full border border-[#d9dfd9] px-3 py-2 text-xs outline-none focus:border-sage sm:max-w-xs" aria-label="Search services" />
                <select value={serviceCategory} onChange={(event) => setServiceCategory(event.target.value)} className="border border-[#d9dfd9] bg-white px-3 py-2 text-xs outline-none focus:border-sage" aria-label="Filter service category"><option value="all">All categories</option>{serviceCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select>
                <select value={serviceVisibility} onChange={(event) => setServiceVisibility(event.target.value)} className="border border-[#d9dfd9] bg-white px-3 py-2 text-xs outline-none focus:border-sage" aria-label="Filter service visibility"><option value="all">All statuses</option><option value="visible">Customer visible</option><option value="hidden">Hidden</option></select>
              </div>
            </div>
            {servicesLoading && <p className="px-5 py-8 text-sm text-ink/50">Loading services...</p>}
            {servicesError && <p role="alert" className="px-5 py-8 text-sm text-clay">{servicesError}</p>}
            {!servicesLoading && !servicesError && visibleServices.length === 0 && <p className="px-5 py-8 text-sm text-ink/50">No matching services.</p>}
            {!servicesLoading && !servicesError && visibleServices.length > 0 && (
              <div className="max-h-[calc(100vh-18rem)] overflow-y-auto">
                {Object.entries(servicesByCategory).sort(([first], [second]) => first.localeCompare(second)).map(([category, categoryServices]) => (
                  <div key={category}>
                    <div className="border-b border-[#e5e9e5] bg-[#f6f8f6] px-5 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-ink/45">{category}</div>
                    <div className="hidden grid-cols-[minmax(0,1fr)_7rem_6rem_7rem_2rem] gap-3 border-b border-[#e5e9e5] px-5 py-2 text-[10px] font-bold uppercase tracking-wide text-ink/35 sm:grid"><span>Service</span><span>Category</span><span>Price</span><span>Status</span><span /></div>
                    <div className="divide-y divide-[#e5e9e5]">
                    {categoryServices.map((service) => (
                    <div key={service.id} className="px-5 py-4">
                    {editingServiceId === service.id ? (
                      <div className="grid w-full gap-2 sm:grid-cols-5">
                        <input value={editForm.name ?? ""} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} className="border border-[#d9dfd9] px-3 py-2 text-sm" aria-label="Service name" />
                        <input value={editForm.category ?? ""} onChange={(event) => setEditForm((current) => ({ ...current, category: event.target.value }))} className="border border-[#d9dfd9] px-3 py-2 text-sm" aria-label="Service category" placeholder="Category" />
                        <input type="number" min="0" value={editForm.price ?? ""} onChange={(event) => setEditForm((current) => ({ ...current, price: Number(event.target.value) }))} className="border border-[#d9dfd9] px-3 py-2 text-sm" aria-label="Service price" />
                        <input type="number" min="1" value={editForm.duration_minutes ?? ""} onChange={(event) => setEditForm((current) => ({ ...current, duration_minutes: Number(event.target.value) }))} className="border border-[#d9dfd9] px-3 py-2 text-sm" aria-label="Service duration" />
                        <div className="flex items-center gap-2 text-xs"><label><input type="checkbox" checked={Boolean(editForm.is_visible)} onChange={(event) => setEditForm((current) => ({ ...current, is_visible: event.target.checked }))} /> Visible</label><label><input type="checkbox" checked={Boolean(editForm.is_available)} onChange={(event) => setEditForm((current) => ({ ...current, is_available: event.target.checked }))} /> Available</label></div>
                        <div className="flex gap-2 sm:col-span-5"><button type="button" onClick={saveService} disabled={savingServiceId === service.id} className="bg-[#26352d] px-3 py-2 text-xs font-semibold text-white">{savingServiceId === service.id ? "Saving..." : "Save"}</button><button type="button" onClick={cancelEditing} className="border border-[#d9dfd9] px-3 py-2 text-xs font-semibold text-ink/60">Cancel</button></div>
                      </div>
                    ) : (<>
                      <div className="grid gap-3 text-sm sm:grid-cols-[minmax(0,1fr)_7rem_6rem_7rem_2rem] sm:items-center"><div className="min-w-0"><p className="font-semibold text-ink">{service.name}</p><p className="mt-1 text-xs text-ink/45">{service.duration_minutes} min</p></div><p className="text-sm text-ink/60">{service.category || "General"}</p><p className="font-semibold text-ink">{service.price_type === "starting" ? "From " : ""}₱{Number(service.price).toLocaleString()}</p><span className={`text-xs font-bold uppercase tracking-wide ${service.is_visible && service.is_available ? "text-sage-deep" : "text-ink/35"}`}>{service.is_visible && service.is_available ? "Visible" : "Hidden"}</span><div className="relative">
                        <button type="button" onClick={() => setOpenServiceMenuId((current) => current === service.id ? null : service.id)} aria-label={`Options for ${service.name}`} title="Service options" className="flex w-7 flex-col items-center gap-1 px-2 py-1 text-ink/50 hover:text-ink">
                          <span className="h-1 w-1 rounded-full bg-current" />
                          <span className="h-1 w-1 rounded-full bg-current" />
                          <span className="h-1 w-1 rounded-full bg-current" />
                        </button>
                        {openServiceMenuId === service.id && <div className="absolute right-0 top-8 z-10 w-28 border border-[#d9dfd9] bg-white p-1 shadow-lg"><button type="button" onClick={() => { startEditing(service); setOpenServiceMenuId(null); }} className="w-full px-2 py-2 text-left text-xs text-ink hover:bg-[#f1f5f1]">Edit</button></div>}
                      </div></div>
                    </>)}
                    </div>
                    ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : module === "system-architecture" ? (
          <div className="mt-6 space-y-6">
            <div className="border border-[#c8a45b]/40 bg-[#fbf9f4] p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="inline-block bg-[#26352d] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                    Architectural Specification
                  </span>
                  <h2 className="mt-2 font-display text-lg text-ink">Modular Three-Tier Client-Server Architecture</h2>
                  <p className="mt-1 text-xs text-ink/70">
                    Compliant with ISO/IEC 25010 Quality Standards and Philippine Data Privacy Act of 2012 (RA 10173).
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-800">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    Operational Uptime &ge; 99%
                  </span>
                </div>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              <div className="flex flex-col border border-[#d9dfd9] bg-white p-5 shadow-sm">
                <div className="border-b border-[#e5e9e5] pb-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-sage-deep">Tier 1</span>
                  <h3 className="text-base font-bold text-ink">Presentation Layer</h3>
                  <p className="text-xs text-ink/50">Client Tier (React 19 + TypeScript)</p>
                </div>
                <ul className="mt-4 flex-1 space-y-3 text-xs text-ink/80">
                  <li className="rounded bg-[#f6f8f6] p-2.5">
                    <strong className="block text-ink">Customer Mobile Web (/)</strong>
                    QR scan or direct link. Guest by default, optional OTP sign-in. Dynamic EWT & position tracking.
                  </li>
                  <li className="rounded bg-[#f6f8f6] p-2.5">
                    <strong className="block text-ink">In-Store Kiosk Tablet (/)</strong>
                    Touchscreen terminal at reception with automatic session reset after registration.
                  </li>
                  <li className="rounded bg-[#f6f8f6] p-2.5">
                    <strong className="block text-ink">Salon Live TV Display (/admin/tv)</strong>
                    HDMI-connected unattended board broadcasting Now Serving, Next Up, and queue totals.
                  </li>
                  <li className="rounded bg-[#f6f8f6] p-2.5">
                    <strong className="block text-ink">Staff &amp; Admin Management Portal</strong>
                    Role-protected console for queue management, service timers, POS billing, and reports.
                  </li>
                </ul>
                <div className="mt-4 border-t border-[#e5e9e5] pt-3 text-[11px] text-ink/60">
                  <span>Stack: </span><strong>Vite 8 • Tailwind CSS 3 • React Router DOM</strong>
                </div>
              </div>

              <div className="flex flex-col border border-[#d9dfd9] bg-white p-5 shadow-sm">
                <div className="border-b border-[#e5e9e5] pb-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-sage-deep">Tier 2</span>
                  <h3 className="text-base font-bold text-ink">Application Layer</h3>
                  <p className="text-xs text-ink/50">Business Logic Tier (Node.js &amp; Express)</p>
                </div>
                <ul className="mt-4 flex-1 space-y-3 text-xs text-ink/80">
                  <li className="rounded bg-[#f6f8f6] p-2.5">
                    <strong className="block text-ink">RESTful API Engine (Node 20+ / Express 5)</strong>
                    Standardized JSON endpoints: <code className="text-[11px] text-sage-deep">/api/queue</code>, <code className="text-[11px] text-sage-deep">/api/forecast</code>, <code className="text-[11px] text-sage-deep">/api/catalog</code>.
                  </li>
                  <li className="rounded bg-[#f6f8f6] p-2.5">
                    <strong className="block text-ink">Queue Prioritization &amp; Grace Rules</strong>
                    Enforces appointment &gt; walk-in order. Demotes appointments &gt; 15 min late to walk-in rank.
                  </li>
                  <li className="rounded bg-[#f6f8f6] p-2.5">
                    <strong className="block text-ink">Milestone SMS Notification Dispatcher</strong>
                    Automated SMS alerts for ticket confirmation, approaching turn, and counter call.
                  </li>
                  <li className="rounded bg-[#f6f8f6] p-2.5">
                    <strong className="block text-ink">Supabase Edge Functions (Deno Runtime)</strong>
                    Privileged serverless functions for secure staff provisioning and credential mediation.
                  </li>
                </ul>
                <div className="mt-4 border-t border-[#e5e9e5] pt-3 text-[11px] text-ink/60">
                  <span>Protocol: </span><strong>HTTPS / TLS 1.3 • CORS Middleware</strong>
                </div>
              </div>

              <div className="flex flex-col border border-[#d9dfd9] bg-white p-5 shadow-sm">
                <div className="border-b border-[#e5e9e5] pb-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-sage-deep">Tier 3</span>
                  <h3 className="text-base font-bold text-ink">Data Layer</h3>
                  <p className="text-xs text-ink/50">Persistence &amp; Analytics Tier (PostgreSQL)</p>
                </div>
                <ul className="mt-4 flex-1 space-y-3 text-xs text-ink/80">
                  <li className="rounded bg-[#f6f8f6] p-2.5">
                    <strong className="block text-ink">Supabase Managed PostgreSQL 15+</strong>
                    Relational storage: <code className="text-[11px]">profiles</code>, <code className="text-[11px]">services</code>, <code className="text-[11px]">queue_entries</code>, <code className="text-[11px]">transactions</code>.
                  </li>
                  <li className="rounded bg-[#f6f8f6] p-2.5">
                    <strong className="block text-ink">In-Database Forecasting RPC (PL/pgSQL)</strong>
                    <code className="text-[11px] text-sage-deep">compute_hybrid_forecast()</code> evaluates 90-day arrivals, combining Moving Average &amp; Linear Regression.
                  </li>
                  <li className="rounded bg-[#f6f8f6] p-2.5">
                    <strong className="block text-ink">Realtime Change-Data-Capture (CDC)</strong>
                    PostgreSQL Write-Ahead Log (WAL) streamed over Secure WebSockets (WSS) with &lt; 2s sync.
                  </li>
                  <li className="rounded bg-[#f6f8f6] p-2.5">
                    <strong className="block text-ink">Row-Level Security (RLS) &amp; Auth</strong>
                    Granular cryptographic JWT access control isolating customer, staff, and admin tables.
                  </li>
                </ul>
                <div className="mt-4 border-t border-[#e5e9e5] pt-3 text-[11px] text-ink/60">
                  <span>Storage: </span><strong>AES-256 at Rest • Daily Point-in-Time Backups</strong>
                </div>
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="border border-[#d9dfd9] bg-white p-5 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sage-deep">Predictive Analytics Formulation</h3>
                <div className="mt-3 space-y-2.5 text-xs text-ink/80">
                  <p><strong>Hybrid Forecast:</strong> <code className="rounded bg-[#f1f3f0] px-1.5 py-0.5 text-sage-deep">0.6 &times; MA(7) + 0.4 &times; max(0, LR(hour))</code></p>
                  <p><strong>Moving Average:</strong> 7-period hourly rolling arrival average smoothing high-frequency noise.</p>
                  <p><strong>Linear Regression:</strong> <code className="rounded bg-[#f1f3f0] px-1.5 py-0.5 text-sage-deep">y = mx + b</code> modeling chronological arrival trajectory.</p>
                  <p><strong>Estimated Wait Time (EWT):</strong> Total pending duration divided by active on-duty staff.</p>
                </div>
              </div>

              <div className="border border-[#d9dfd9] bg-white p-5 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sage-deep">Queue Prioritization &amp; Compliance</h3>
                <div className="mt-3 space-y-2.5 text-xs text-ink/80">
                  <p><strong>Priority Formula:</strong> <code className="rounded bg-[#f1f3f0] px-1.5 py-0.5 text-sage-deep">QueueRank = (ArrivalRank &times; 10) + PriorityWeight</code></p>
                  <p><strong>Arrival Ranks:</strong> Appointment (0), Walk-in (1). Tardiness &gt; 15 min demotes to walk-in.</p>
                  <p><strong>Priority Weights:</strong> VIP (0), Senior Citizen &amp; PWD (1), Regular (2).</p>
                  <p><strong>Data Privacy:</strong> Philippine RA 10173 compliant; anonymous guest participation supported.</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <section className="mt-6 grid gap-3 sm:grid-cols-3">
            {config.areas.map((area) => (
              <div key={area} className="border border-[#d9dfd9] bg-white p-5">
                <p className="text-sm font-semibold text-ink">{area}</p>
                <button type="button" className="mt-4 border border-[#d9dfd9] px-3 py-2 text-xs font-semibold text-sage-deep hover:bg-[#f1f5f1]">Open</button>
              </div>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
