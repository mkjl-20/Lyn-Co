import { Navigate } from "react-router-dom";
import { AdminBusinessModules } from "../../../../admin/features/businessModules/pages/AdminBusinessModules";
import { useAuth } from "../../../../../shared/context/useAuth";
import { BackButton } from "@/shared/components/BackButton";

export default function StaffPosPage() {
  const { currentUser } = useAuth();

  if (currentUser?.staffRole !== "receptionist") {
    return <Navigate to="/unauthorized" replace />;
  }

  return (
    <div className="pastel-pink-gradient-page flex min-h-screen flex-col text-ink">
      <header className="flex items-center gap-4 border-b border-mist bg-white/80 px-4 py-3 sm:px-6">
        <BackButton to="/lyn-co/staff" label="Back to staff dashboard" />
        <h1 className="font-display text-xl font-semibold">Front desk POS</h1>
      </header>
      <AdminBusinessModules module="pos-transactions" showPaymentHistory={false} />
    </div>
  );
}
