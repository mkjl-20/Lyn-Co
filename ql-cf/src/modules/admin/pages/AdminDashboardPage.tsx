import { useAuth } from "@/shared/context/AuthContext";

export function AdminDashboardPage() {
  const { currentUser } = useAuth();

  return (
    <main className="min-h-screen bg-[#eef1ed] text-ink">
      <header className="border-b border-[#d9dfd9] bg-[#f8faf8] px-5 py-4 sm:px-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sage-deep">Control center / Overview</p>
        <h2 className="mt-1 font-display text-2xl text-ink">Good morning, {currentUser?.fullName ?? "Administrator"}</h2>
      </header>
      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        <section className="grid grid-cols-2 border border-[#d9dfd9] bg-white sm:grid-cols-4">
          {[["Queue status", "Live", "All stations connected"], ["Active staff", "-", "Awaiting live count"], ["Today's revenue", "-", "POS not configured"], ["Alerts", "0", "No critical issues"]].map(([label, value, hint], index) => (
            <div key={label} className={`p-4 sm:p-5 ${index > 0 ? "border-l border-[#d9dfd9]" : ""}`}>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-ink/40">{label}</p>
              <p className="mt-2 font-display text-xl text-ink">{value}</p>
              <p className="mt-1 text-[11px] text-ink/45">{hint}</p>
            </div>
          ))}
        </section>
        <section className="border-l-2 border-sage bg-white px-4 py-3 text-xs text-ink/55">
          <strong className="font-semibold text-ink">System status:</strong> LynQ is ready for administrative operations.
        </section>
      </div>
    </main>
  );
}
