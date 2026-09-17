import { NavLink } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/shared/context/AuthContext";

const MENU_ITEMS = [
  ["Staff Management", "/admin/staff", "Staff accounts and availability"],
  ["Service Catalog", "/admin/module/service-catalog", "Services, pricing, and visibility"],
  ["VIP & Customer Tags", "/admin/module/customer-tagging", "VIP customers and customer types"],
  ["Promotions & Events", "/admin/module/promotions-events", "Offers and forecast events"],
  ["Settings & Branding", "/admin/module/settings-branding", "Salon configuration"],
  ["Queue Control", "/admin/queue", "Live queue, stations, and TV display"],
  ["TV Display", "/admin/tv", "Now Serving screen controls"],
  ["POS & Transactions", "/admin/module/pos-transactions", "Revenue, refunds, and voids"],
  ["Analytics", "/admin/analytics", "Performance and no-show reports"],
  ["Forecasting", "/admin/module/forecasting", "Forecasts and staffing recommendations"],
  ["Reports", "/admin/module/reports", "Printable operational reports"],
  ["Backup & Restore", "/admin/module/backup-restore", "Data recovery workflows"],
  ["System Architecture", "/admin/module/system-architecture", "3-Tier architecture & specifications"],
  ["Account Management", "/admin/account", "Your admin account"],
];

export function AdminSidebar({ isCollapsed, onToggle }: { isCollapsed: boolean; onToggle: () => void }) {
  const { logout } = useAuth();
  const [showLogoutConfirmation, setShowLogoutConfirmation] = useState(false);

  return (
    <aside className={`relative flex h-screen shrink-0 flex-col overflow-visible bg-[#26352d] text-white transition-[width] duration-200 ${isCollapsed ? "w-14" : "w-60 border-r border-[#d9dfd9]"}`}>
      <div className={`${isCollapsed ? "" : "border-b border-white/10"} px-4 py-4`}>
        {isCollapsed ? (
          <button type="button" onClick={onToggle} aria-label="Expand sidebar" title="Expand sidebar" className="flex h-9 w-full items-center justify-center text-white/60 hover:text-white">
            <span className="flex w-4 flex-col gap-1" aria-hidden="true"><span className="h-px w-full bg-current" /><span className="h-px w-full bg-current" /><span className="h-px w-full bg-current" /></span>
          </button>
        ) : (
          <div className="relative flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1 font-display text-xl text-white">
              Lyn &amp; Co
            </div>
            <button type="button" onClick={onToggle} aria-label="Collapse sidebar" title="Collapse sidebar" className="flex h-7 w-7 shrink-0 items-center justify-center text-white/60 hover:text-white">
              <span className="inline-flex w-4 flex-col gap-1" aria-hidden="true"><span className="h-px w-full bg-current" /><span className="h-px w-full bg-current" /><span className="h-px w-full bg-current" /></span>
            </button>
          </div>
        )}
      </div>
      <nav className="flex-1 px-3 py-2" aria-label="Admin navigation">
        {!isCollapsed && <>
          <NavLink to="/admin" end title="Overview" className={({ isActive }) => `mt-1 flex px-3 py-1.5 text-[13px] font-semibold ${isActive ? "border-l-2 border-[#c8a45b] bg-white/10 text-white" : "text-white/60 hover:text-white"}`}>
            Overview
          </NavLink>
          {MENU_ITEMS.map(([label, path, description]) => (
            <NavLink key={label} to={path} title={description} className={({ isActive }) => `flex border-l-2 px-3 py-1.5 text-[13px] transition ${isActive ? "border-[#c8a45b] bg-white/10 text-white" : "border-transparent text-white/65 hover:border-[#c8a45b] hover:bg-white/5 hover:text-white"}`}>{label}</NavLink>
          ))}
        </>}
      </nav>
      <div className="border-t border-white/10 p-3">
        <button type="button" onClick={() => setShowLogoutConfirmation(true)} aria-label="Sign out" title="Sign out" className={`flex w-full items-center justify-center gap-2 rounded-md py-1.5 text-[13px] text-white/55 transition-colors hover:text-[#d98672] hover:underline hover:underline-offset-4 ${isCollapsed ? "px-2" : "px-3"}`}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <path d="M14 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8" strokeLinecap="round" />
            <path d="M11 12h9m-4-4 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {!isCollapsed && "Sign out"}
        </button>
      </div>
      {showLogoutConfirmation && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]">
        <div className="w-full max-w-xs rounded-lg bg-white p-5 text-center shadow-2xl">
          <h2 className="text-base font-semibold text-ink">Log out?</h2>
          <div className="mt-5 flex flex-col gap-2">
            <button type="button" onClick={logout} className="w-full rounded-md bg-clay px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#9f4937]">Log out</button>
            <button type="button" onClick={() => setShowLogoutConfirmation(false)} className="w-full rounded-md px-4 py-2.5 text-sm text-ink/60 hover:bg-[#f1f3f0]">Cancel</button>
          </div>
        </div>
      </div>}
    </aside>
  );
}
