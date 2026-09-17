import { useAuth } from "@/shared/context/AuthContext";
import { useNavigate } from "react-router-dom";

interface AdminFeature {
  number: string;
  title: string;
  requirements: string;
  description: string;
  accent: string;
  path?: string;
}

const ADMIN_FEATURES: AdminFeature[] = [
  {
    number: "01",
    title: "Staff Management",
    requirements: "FR1, FR33",
    description: "Create, edit, deactivate, archive, and manage staff availability.",
    accent: "bg-sage-light text-sage-deep",
    path: "/admin/staff",
  },
  {
    number: "02",
    title: "Service Catalog Management",
    requirements: "FR2, FR38",
    description: "Manage services, pricing, visibility, and price-at-selection rules.",
    accent: "bg-gold-light text-gold",
  },
  {
    number: "03",
    title: "VIP & Customer Tagging",
    requirements: "FR3, FR17",
    description: "Manage VIP customers and customer type tagging rules.",
    accent: "bg-clay-light text-clay",
  },
  {
    number: "04",
    title: "Promotions & Events",
    requirements: "FR4, FR6",
    description: "Set up promotions and flag holidays or events that affect forecasts.",
    accent: "bg-sage-light text-sage-deep",
  },
  {
    number: "05",
    title: "System Settings & Branding",
    requirements: "FR5",
    description: "Configure business hours, branding, salon information, and thresholds.",
    accent: "bg-gold-light text-gold",
  },
  {
    number: "06",
    title: "Salon Queue Map & Control",
    requirements: "FR26, FR27, FR28, FR30, FR32",
    description: "View every station, reorder the queue, handle alerts, and control TV display settings.",
    accent: "bg-clay-light text-clay",
    path: "/admin/queue",
  },
  {
    number: "07",
    title: "POS & Transactions",
    requirements: "FR37, FR38, FR39",
    description: "Manage transactions, revenue by service, refunds, and authorized voids.",
    accent: "bg-sage-light text-sage-deep",
  },
  {
    number: "08",
    title: "Analytics Dashboard",
    requirements: "FR42, FR48",
    description: "Review day, week, month, and year analytics with no-show rates.",
    accent: "bg-gold-light text-gold",
    path: "/admin/analytics",
  },
  {
    number: "09",
    title: "Forecasting & Predictive Analytics",
    requirements: "FR43-FR46",
    description: "Explore forecasts, staffing recommendations, what-if scenarios, and predicted versus actual outcomes.",
    accent: "bg-clay-light text-clay",
  },
  {
    number: "10",
    title: "Reports",
    requirements: "FR47",
    description: "Generate printable PDF reports from operational and forecast data.",
    accent: "bg-sage-light text-sage-deep",
  },
  {
    number: "11",
    title: "Backup & Restore",
    requirements: "FR49",
    description: "Trigger scheduled backups and restore data when needed.",
    accent: "bg-gold-light text-gold",
  },
];

export function AdminDashboardPage() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#eef1ed] text-ink">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-[#d9dfd9] bg-[#26352d] text-white lg:flex lg:flex-col">
          <div className="border-b border-white/10 px-6 py-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#a8c1ae]">LYN & CO</p>
            <h1 className="mt-2 font-display text-2xl">LynQ <span className="text-[#a8c1ae]">/</span> Admin</h1>
            <p className="mt-1 text-xs text-white/45">Operations control center</p>
          </div>
          <nav className="flex-1 px-3 py-5" aria-label="Admin navigation">
            <p className="px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Workspace</p>
            <button type="button" className="mt-3 flex w-full items-center gap-3 border-l-2 border-[#c8a45b] bg-white/10 px-3 py-2.5 text-left text-sm font-semibold text-white">
              <span className="text-[#d4b66f]">01</span> Overview
            </button>
            {[
              ["Queue control", "/admin/queue"],
              ["Staff directory", "/admin/staff"],
              ["Analytics", "/admin/analytics"],
            ].map(([label, path]) => (
              <button key={path} type="button" onClick={() => navigate(path)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-white/60 transition hover:bg-white/5 hover:text-white">
                <span className="text-[11px] text-white/30">›</span> {label}
              </button>
            ))}
            <p className="mt-8 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Administration</p>
            <p className="px-3 py-3 text-xs leading-5 text-white/40">Catalog, transactions, reports, forecasting, and system configuration.</p>
          </nav>
          <div className="border-t border-white/10 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center bg-[#b9cdbd] text-xs font-bold text-[#26352d]">{(currentUser?.fullName ?? "A").charAt(0)}</div>
              <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{currentUser?.fullName ?? "Administrator"}</p><p className="text-[10px] text-white/40">Administrator</p></div>
            </div>
            <button type="button" onClick={logout} className="mt-4 w-full border border-white/15 px-3 py-2 text-xs text-white/60 transition hover:bg-white/10 hover:text-white">Sign out</button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="border-b border-[#d9dfd9] bg-[#f8faf8] px-5 py-4 sm:px-8">
            <div className="flex items-center justify-between gap-4">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sage-deep">Control center / Overview</p><h2 className="mt-1 font-display text-2xl text-ink sm:text-3xl">Good morning, {currentUser?.fullName ?? "Administrator"}</h2></div>
              <div className="flex items-center gap-2 text-xs text-ink/50"><span className="h-2 w-2 bg-sage" /> System operational</div>
            </div>
          </header>

          <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-8">
            <section className="grid grid-cols-2 border border-[#d9dfd9] bg-white sm:grid-cols-4">
              {[['Queue status', 'Live', 'All stations connected'], ['Active staff', '—', 'Awaiting live count'], ['Today\'s revenue', '—', 'POS not configured'], ['Alerts', '0', 'No critical issues']].map(([label, value, hint], index) => (
                <div key={label} className={`p-4 sm:p-5 ${index > 0 ? 'border-l border-[#d9dfd9]' : ''}`}><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-ink/40">{label}</p><p className="mt-2 font-display text-2xl text-ink">{value}</p><p className="mt-1 text-[11px] text-ink/45">{hint}</p></div>
              ))}
            </section>

            <section>
              <div className="mb-3 flex items-end justify-between border-b border-[#cfd7d0] pb-3"><div><h3 className="font-display text-xl text-ink">Administrative systems</h3><p className="mt-1 text-xs text-ink/50">Feature registry and operational access points</p></div><span className="font-mono text-[11px] text-ink/40">11 MODULES</span></div>
              <div className="overflow-hidden border border-[#d9dfd9] bg-white">
                {ADMIN_FEATURES.map((feature) => {
                  const row = <><span className="w-8 shrink-0 font-mono text-xs text-ink/35">{feature.number}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-ink">{feature.title}</span><span className="mt-1 block truncate text-xs text-ink/45">{feature.description}</span></span><span className="hidden w-28 shrink-0 font-mono text-[10px] text-ink/35 sm:block">{feature.requirements}</span><span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider ${feature.path ? 'text-sage-deep' : 'text-ink/30'}`}>{feature.path ? 'Available' : 'Planned'}</span><span className="w-5 text-right text-ink/30">{feature.path ? '→' : '·'}</span></>;
                  return feature.path ? <button key={feature.title} type="button" onClick={() => navigate(feature.path!)} className="group flex w-full items-center gap-3 border-b border-[#e5e9e5] px-4 py-4 text-left transition last:border-0 hover:bg-[#f4f7f4] sm:px-5">{row}</button> : <div key={feature.title} className="flex items-center gap-3 border-b border-[#e5e9e5] px-4 py-4 last:border-0 sm:px-5">{row}</div>;
                })}
              </div>
            </section>

            <section className="flex items-center gap-3 border-l-2 border-sage bg-white px-4 py-3 text-xs text-ink/55"><span className="h-2 w-2 bg-sage" /><span><strong className="font-semibold text-ink">System status:</strong> LynQ is ready for administrative operations.</span><span className="ml-auto hidden font-mono text-[10px] text-ink/35 sm:block">LAST CHECK: NOW</span></section>
          </div>
        </main>
      </div>
    </div>
  );
}