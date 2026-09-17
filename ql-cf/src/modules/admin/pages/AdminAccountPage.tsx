import { useAuth } from "@/shared/context/AuthContext";

export function AdminAccountPage() {
  const { currentUser } = useAuth();

  return (
    <main className="min-h-screen bg-[#eef1ed] p-4 text-ink sm:p-6">
      <div className="mx-auto max-w-4xl">
        <div className="border-b border-[#cfd7d0] pb-4"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sage-deep">Account</p><h1 className="mt-1 font-display text-2xl text-ink">Account Management</h1></div>
        <section className="mt-6 border border-[#d9dfd9] bg-white p-5 sm:p-6">
          <h2 className="text-sm font-semibold">Profile</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-xs text-ink/60">Full name<input defaultValue={currentUser?.fullName ?? ""} className="mt-2 w-full border border-[#d9dfd9] px-3 py-2 text-sm text-ink outline-none focus:border-sage" /></label><label className="text-xs text-ink/60">Username<input defaultValue={currentUser?.username ?? ""} disabled className="mt-2 w-full border border-[#d9dfd9] bg-[#f3f5f3] px-3 py-2 text-sm text-ink/50" /></label></div>
          <button type="button" className="mt-5 bg-[#26352d] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#34483b]">Save profile</button>
        </section>
        <section className="mt-4 border border-[#d9dfd9] bg-white p-5 sm:p-6"><h2 className="text-sm font-semibold">Security</h2><p className="mt-1 text-xs text-ink/45">Update the password for this administrator account.</p><button type="button" className="mt-4 border border-[#d9dfd9] px-4 py-2.5 text-xs font-semibold text-sage-deep hover:bg-[#f1f5f1]">Change password</button></section>
      </div>
    </main>
  );
}
