import { BackButton } from "@/shared/components/BackButton";
import { StaffServiceHistory } from "../components/StaffServiceHistory";

export default function StaffHistoryPage() {
  return (
    <div className="pastel-pink-gradient-page min-h-screen text-ink">
      <header className="border-b border-[var(--app-border)] bg-white/75 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center px-4 sm:px-6">
          <BackButton to="/lyn-co/staff" label="Back to staff dashboard" />
          <h1 className="ml-4 font-display text-base font-semibold">Service History</h1>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
        <StaffServiceHistory />
      </main>
    </div>
  );
}
