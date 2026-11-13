import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import supabase from "../../../../../shared/lib/supabaseClient";
import { apiRequest } from "../../../../../shared/lib/apiClient";
import { PasswordVisibilityButton } from "../../../../../shared/components/PasswordVisibilityButton";
import { StatusBadge } from "../../../../../shared/components/StatusBadge";
import { MoreVertical } from "lucide-react";
import { useFeedback } from "../../../../../shared/components/FeedbackContext";

type StaffRole =
  | "receptionist"
  | "hairstylist"
  | "nail_technician"
  | "manicurist"
  | "pedicurist";

interface Staff {
  id: string;
  username: string;
  full_name: string;
  account_role: "admin" | "staff";
  staff_role: StaffRole | null;
  is_active: boolean;
}

interface CreateStaffForm {
  username: string;
  full_name: string;
  staff_role: StaffRole;
  password: string;
  confirm_password: string;
}

const initialForm: CreateStaffForm = {
  username: "",
  full_name: "",
  staff_role: "hairstylist",
  password: "",
  confirm_password: "",
};

export default function StaffManagementPage() {
  const { confirm } = useFeedback();
  const [staff, setStaff] = useState<Staff[]>([]);

  const [search, setSearch] = useState("");

  const [roleFilter, setRoleFilter] =
    useState<"all" | StaffRole>("all");

  const [showCreateModal, setShowCreateModal] =
    useState(false);

  const [form, setForm] =
    useState<CreateStaffForm>(initialForm);

  const [loading, setLoading] = useState(false);

  const [loadingStaff, setLoadingStaff] =
    useState(true);

  const [error, setError] = useState("");

  const [success, setSuccess] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editStaffRole, setEditStaffRole] = useState<StaffRole>("hairstylist");
  const [isSavingStaff, setIsSavingStaff] = useState(false);
  const [openStaffActionsId, setOpenStaffActionsId] = useState<string | null>(null);

  // ==========================================
  // LOAD STAFF
  // ==========================================

  const loadStaff = async () => {
    setLoadingStaff(true);
    setError("");

    try {
      const {
        data,
        error: fetchError,
      } = await supabase
        .from("profiles")
        .select(
          "id, username, full_name, account_role, staff_role, is_active"
        )
        .eq("account_role", "staff")
        .order("created_at", {
          ascending: false,
        });

      if (fetchError) {
        console.error(
          "Failed to load staff:",
          fetchError
        );

        throw new Error(
          fetchError.message ||
            "Unable to load staff accounts."
        );
      }

      setStaff((data ?? []) as Staff[]);
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load staff accounts."
      );
    } finally {
      setLoadingStaff(false);
    }
  };

  // ==========================================
  // LOAD STAFF WHEN PAGE OPENS
  // ==========================================

  useEffect(() => {
    loadStaff();
  }, []);

  // ==========================================
  // FILTER STAFF
  // ==========================================

  const filteredStaff = useMemo(() => {
    const query = search.trim().toLowerCase();

    return staff.filter((member) => {
      const matchesSearch =
        !query ||
        member.full_name
          .toLowerCase()
          .includes(query) ||
        member.username
          .toLowerCase()
          .includes(query);

      const matchesRole =
        roleFilter === "all" ||
        (roleFilter === "manicurist"
          ? ["nail_technician", "manicurist", "pedicurist"].includes(member.staff_role ?? "")
          : member.staff_role === roleFilter);

      return matchesSearch && matchesRole;
    });
  }, [staff, search, roleFilter]);

  // ==========================================
  // FORM CHANGE
  // ==========================================

  const handleChange = (
    event: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));

    if (error) {
      setError("");
    }
  };

  // ==========================================
  // OPEN CREATE MODAL
  // ==========================================

  const openCreateModal = () => {
    setForm(initialForm);
    setError("");
    setShowCreateModal(true);
  };

  // ==========================================
  // CLOSE CREATE MODAL
  // ==========================================

  const closeCreateModal = () => {
    if (loading) return;

    setShowCreateModal(false);
    setForm(initialForm);
    setError("");
  };

  // ==========================================
  // CREATE STAFF
  // ==========================================

  const handleCreateStaff = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    setError("");
    setSuccess("");

    const username = form.username
      .trim()
      .toLowerCase();

    const fullName = form.full_name.trim();

    // -------------------------------
    // VALIDATION
    // -------------------------------

    if (!username) {
      setError("Username is required.");
      return;
    }

    if (!/^[a-z0-9._-]+$/.test(username)) {
      setError(
        "Username may only contain letters, numbers, dots, underscores, and hyphens."
      );
      return;
    }

    if (!fullName) {
      setError("Full name is required.");
      return;
    }

    if (!form.password) {
      setError("Password is required.");
      return;
    }

    if (form.password.length < 8) {
      setError(
        "Password must contain at least 8 characters."
      );
      return;
    }

    if (
      form.password !== form.confirm_password
    ) {
      setError("Passwords do not match.");
      return;
    }

    // -------------------------------
    // START REQUEST
    // -------------------------------

    setLoading(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        throw new Error("Your admin session has expired. Please sign in again.");
      }

      console.log(
        "Creating staff account:",
        {
          username,
          fullName,
          staffRole: form.staff_role,
        }
      );

      const data = await apiRequest<{ success?: boolean; message?: string; warning?: string }>("/api/admin/staff", {
        method: "POST",
        body: JSON.stringify({
          username,
          full_name: fullName,
          staff_role: form.staff_role,
          password: form.password,
        }),
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      console.log(
        "Create staff response:",
        data
      );

      // -------------------------------
      // SUCCESS
      // -------------------------------

      await loadStaff();

      setShowCreateModal(false);

      setForm(initialForm);

      setSuccess(
        `${fullName} was successfully added as a ${formatStaffRole(
          form.staff_role
        )}.${data.warning ? ` ${data.warning}` : ""}`
      );
    } catch (err) {
      console.error(
        "Create staff failed:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Unable to create staff account."
      );
    } finally {
      setLoading(false);
    }
  };

  const openEditStaff = (member: Staff) => {
    setError("");
    setEditingStaff(member);
    setEditFullName(member.full_name);
    setEditStaffRole(normalizeStaffRole(member.staff_role));
  };

  const handleUpdateStaff = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingStaff) return;

    const fullName = editFullName.trim();
    if (!fullName || fullName.length > 120) {
      setError("Enter a staff name between 1 and 120 characters.");
      return;
    }

    setIsSavingStaff(true);
    setError("");
    setSuccess("");
    try {
      await apiRequest<{ success: boolean }>(`/api/admin/staff/${editingStaff.id}`, {
        method: "PATCH",
        body: JSON.stringify({ full_name: fullName, staff_role: editStaffRole }),
      });
      setEditingStaff(null);
      setSuccess(`Updated staff account for ${fullName}.`);
      await loadStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update staff account.");
    } finally {
      setIsSavingStaff(false);
    }
  };

  const handleToggleStaffStatus = async (member: Staff) => {
    const isActive = !member.is_active;
    const action = isActive ? "activate" : "deactivate";
    if (!await confirm({
      title: `${isActive ? "Activate" : "Deactivate"} staff account`,
      message: `Are you sure you want to ${action} ${member.full_name}'s account?`,
      confirmLabel: isActive ? "Activate account" : "Deactivate account",
      destructive: !isActive,
    })) return;

    setError("");
    setSuccess("");
    try {
      await apiRequest<{ success: boolean }>(`/api/admin/staff/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: isActive }),
      });
      setSuccess(`${member.full_name}'s account was ${isActive ? "activated" : "deactivated"}.`);
      await loadStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update staff account status.");
    }
  };

  const handleResetStaffPassword = async (member: Staff) => {
    if (!await confirm({
      title: "Reset staff password",
      message: `Reset ${member.full_name}'s password? Their current password will stop working and they must choose a new one at next sign-in.`,
      confirmLabel: "Reset password",
      destructive: true,
    })) return;
    setError("");
    setSuccess("");
    try {
      const result = await apiRequest<{
        success: boolean;
        message: string;
        temporaryPassword: string;
        warning?: string;
      }>(`/api/admin/staff/${member.id}/password-reset`, { method: "POST" });
      setSuccess(`${result.message}${result.warning ? ` ${result.warning}` : ""}`);
      window.alert(
        `Temporary password for ${member.username}:\n\n${result.temporaryPassword}\n\nShare it securely. It will only be shown once and must be changed at next sign-in.`,
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to reset the staff password.");
    }
  };

  // ==========================================
  // UI
  // ==========================================

  return (
    <div className="pastel-pink-gradient-page flex h-full min-h-0 flex-col overflow-hidden text-ink">
      {(error || success) && createPortal(
        <div className="pointer-events-none fixed inset-x-0 top-4 z-[200] flex justify-center px-4">
          <div
            role={error ? "alert" : "status"}
            className={`pointer-events-auto flex w-full max-w-lg items-start gap-3 rounded-xl border p-4 shadow-xl ${
              error
                ? "border-clay/25 bg-white text-clay"
                : "border-success/25 bg-white text-success"
            }`}
          >
            <span className="flex-1 text-sm font-medium">{error || success}</span>
            <button
              type="button"
              onClick={() => {
                if (error) setError("");
                else setSuccess("");
              }}
              aria-label="Dismiss notification"
              className="shrink-0 rounded px-2 text-sm font-semibold opacity-70 hover:opacity-100"
            >
              ×
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* ======================================
          PAGE HEADER
      ====================================== */}

      <div className="shrink-0">

        <div className="mx-auto max-w-6xl px-4 py-2 sm:px-6">

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">

            <button
              type="button"
              onClick={openCreateModal}
              className="
                inline-flex items-center justify-center
                gap-2 rounded-lg
                dashboard-primary-action px-4 py-2
                text-sm font-semibold
                shadow-sm
                transition
                hover:shadow-md
                focus:outline-none
                focus:ring-2
                focus:ring-sage-light
                disabled:cursor-not-allowed
                disabled:opacity-50
              "
            >
              <span className="text-lg leading-none">
                +
              </span>

                Add staff
            </button>

          </div>

        </div>

      </div>

      {/* ======================================
          MAIN CONTENT
      ====================================== */}

      <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-y-auto px-4 pb-3 pt-1 sm:px-6">

        {/* ====================================
            STAFF TABLE
        ==================================== */}

        <section className="flex flex-col rounded-xl border border-mist bg-white shadow-sm">

          {/* TABLE HEADER */}

          <div className="shrink-0 border-b border-mist px-4 py-2 sm:px-5">

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">

              <div>

                <h2 className="font-display text-lg font-semibold text-ink">
                  Staff Accounts
                </h2>


              </div>

              <span className="w-fit rounded-full bg-sage-light px-3 py-1.5 text-xs font-semibold text-sage-deep">
                {filteredStaff.length}{" "}
                {filteredStaff.length === 1
                  ? "member"
                  : "members"}
              </span>

            </div>

          </div>

          {/* FILTERS */}

          <div className="flex shrink-0 flex-col gap-2 border-b border-mist bg-gray-50/50 p-2 sm:flex-row">

            {/* SEARCH */}

            <div className="relative flex-1">

              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                }}
                placeholder="Search staff..."
                className="dashboard-filter-control w-full outline-none transition placeholder:text-gray-400 focus:border-sage focus:ring-2 focus:ring-sage-light"
              />

            </div>

            {/* ROLE FILTER */}

            <select
              value={roleFilter}
              onChange={(event) => {
                setRoleFilter(event.target.value as "all" | StaffRole);
              }}
              className="dashboard-filter-control w-full outline-none focus:border-sage focus:ring-2 focus:ring-sage-light sm:w-48"
            >
              <option value="all">
                All Staff Roles
              </option>

              <option value="hairstylist">
                Hairstylist
              </option>

              <option value="manicurist">Nail Technician</option>

              <option value="receptionist">
                Receptionist
              </option>
            </select>

          </div>

          {/* ==================================
              LOADING
          ================================== */}

          {loadingStaff ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center">

              <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-mist border-t-sage" />

              <p className="text-sm text-gray-500">
                Loading staff accounts...
              </p>

            </div>
          ) : (

            /* ==================================
               TABLE
            ================================== */

            <div className="max-h-[min(65dvh,48rem)] overflow-auto">

              <table className="admin-responsive-table w-full table-fixed text-sm">

                <thead>
                  <tr className="border-b border-mist bg-gray-50/70">

                    <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-400">
                      Staff Member
                    </th>

                    <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-400">
                      Username
                    </th>

                    <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-400">
                      Role
                    </th>

                    <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-400">
                      Status
                    </th>

                    <th className="w-[12%] px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-gray-400">
                      Actions
                    </th>

                  </tr>
                </thead>

                <tbody className="divide-y divide-mist">

                  {filteredStaff.length ===
                  0 ? (

                    <tr>

                      <td
                        colSpan={5}
                        className="px-6 py-16 text-center"
                      >

                        <div className="mx-auto max-w-sm">

                          <h3 className="font-display text-base font-semibold text-ink">
                            No staff found
                          </h3>

                          <p className="mt-1 text-sm text-gray-500">
                            {search ||
                            roleFilter !==
                              "all"
                              ? "Try changing your search or filter."
                              : "Create your first staff account to get started."}
                          </p>

                          {!search &&
                            roleFilter ===
                              "all" && (
                              <button
                                type="button"
                                onClick={
                                  openCreateModal
                                }
                                className="
                                  mt-5
                                  rounded-lg
                                  bg-sage
                                  px-4 py-2.5
                                  text-sm
                                  font-semibold
                                  text-white
                                  hover:bg-sage-deep
                                "
                              >
                                Add staff
                              </button>
                            )}

                        </div>

                      </td>

                    </tr>

                  ) : (

                    filteredStaff.map(
                      (member) => (
                        <tr
                          key={member.id}
                          className="transition hover:bg-sage-light/30"
                        >

                          {/* STAFF */}

                          <td data-label="Staff Member" className="px-6 py-3">

                            <div className="flex items-center gap-3">

                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sage-light text-xs font-bold text-sage-deep">
                                {getInitials(
                                  member.full_name
                                )}
                              </div>

                              <div>

                                <p className="text-sm font-semibold text-ink">
                                  {
                                    member.full_name
                                  }
                                </p>

                              </div>

                            </div>

                          </td>

                          {/* USERNAME */}

                          <td data-label="Username" className="px-6 py-3">

                            <span className="rounded-md bg-gray-50 px-2 py-1 font-mono text-xs text-gray-600">
                              @
                              {
                                member.username
                              }
                            </span>

                          </td>

                          {/* ROLE */}

                          <td data-label="Role" className="px-6 py-3">

                            <span
                              className={`
                                inline-flex rounded-full
                                px-3 py-1.5
                                text-xs font-semibold
                                ${getRoleClasses(
                                  member.staff_role
                                )}
                              `}
                            >
                              {formatStaffRole(
                                member.staff_role
                              )}
                            </span>

                          </td>

                          {/* STATUS */}

                          <td data-label="Status" className="px-6 py-3">

                            <StatusBadge status={member.is_active ? "active" : "inactive"}>
                              {member.is_active
                                ? "Active"
                                : "Inactive"}
                            </StatusBadge>

                          </td>

                          {/* ACTION */}

                          <td data-label="Actions" className="staff-actions-cell px-4 py-3 text-right">
                            <div className="relative flex justify-end">
                              <button
                                type="button"
                                aria-label={`Actions for ${member.full_name}`}
                                aria-haspopup="menu"
                                aria-expanded={openStaffActionsId === member.id}
                                onClick={() => setOpenStaffActionsId((current) => current === member.id ? null : member.id)}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-mist text-ink/70 transition hover:bg-porcelain hover:text-ink"
                              >
                                <MoreVertical size={18} aria-hidden="true" />
                              </button>
                              {openStaffActionsId === member.id && (
                                <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-lg border border-mist bg-white p-1 text-left shadow-lg">
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      setOpenStaffActionsId(null);
                                      openEditStaff(member);
                                    }}
                                    className="ui-action-edit w-full rounded-md px-3 py-2.5 text-left text-xs font-semibold transition hover:bg-porcelain"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      setOpenStaffActionsId(null);
                                      void handleResetStaffPassword(member);
                                    }}
                                    className="w-full rounded-md px-3 py-2.5 text-left text-xs font-semibold text-ink/75 transition hover:bg-gold-light"
                                  >
                                    Reset password
                                  </button>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      setOpenStaffActionsId(null);
                                      void handleToggleStaffStatus(member);
                                    }}
                                    className={`${member.is_active ? "ui-action-danger" : "ui-action-positive"} w-full rounded-md px-3 py-2.5 text-left text-xs font-semibold transition hover:bg-porcelain`}
                                  >
                                    {member.is_active ? "Deactivate" : "Activate"}
                                  </button>
                                </div>
                              )}
                            </div>

                          </td>

                        </tr>
                      )
                    )

                  )}

                </tbody>

              </table>
              <div aria-hidden="true" className="h-8 bg-gray-100" />

            </div>
          )}
        </section>

      </main>

      {/* ======================================
          CREATE STAFF MODAL
      ====================================== */}

      {editingStaff && (
        createPortal(
          <div
            className="fixed inset-0 z-[110] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !isSavingStaff) setEditingStaff(null);
            }}
          >
            <div
              className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-staff-title"
            >
              <h2 id="edit-staff-title" className="font-display text-xl font-semibold text-ink">Edit staff account</h2>
              <form onSubmit={handleUpdateStaff} className="mt-5 space-y-4">
                <div>
                  <label htmlFor="edit-staff-name" className="mb-1 block text-sm font-medium text-ink">Full name</label>
                  <input
                    id="edit-staff-name"
                    value={editFullName}
                    onChange={(event) => setEditFullName(event.target.value)}
                    maxLength={120}
                    required
                    className="w-full rounded-lg border border-mist px-3 py-2 text-sm text-ink outline-none focus:border-sage"
                  />
                </div>
                <div>
                  <label htmlFor="edit-staff-role" className="mb-1 block text-sm font-medium text-ink">Staff role</label>
                  <select
                    id="edit-staff-role"
                    value={editStaffRole}
                    onChange={(event) => setEditStaffRole(event.target.value as StaffRole)}
                    className="w-full rounded-lg border border-mist px-3 py-2 text-sm text-ink outline-none focus:border-sage"
                  >
                    <option value="hairstylist">Hairstylist</option>
                    <option value="manicurist">Nail Technician</option>
                    <option value="receptionist">Receptionist</option>
                  </select>
                </div>
                {error && <p role="alert" className="text-sm text-clay">{error}</p>}
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingStaff(null);
                      setError("");
                    }}
                    disabled={isSavingStaff}
                    className="form-cancel-action rounded-lg px-4 py-2 text-sm font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingStaff}
                    className="dashboard-primary-action rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    {isSavingStaff ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )
      )}

      {showCreateModal && createPortal(

        <div
          className="
            fixed inset-0 z-[110]
            flex items-center justify-center
            bg-ink/50
            p-3 sm:p-4
            backdrop-blur-sm
          "
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeCreateModal();
            }
          }}
        >

          <div
            className="
              flex w-full max-w-xl
              max-h-[calc(100dvh-1.5rem)]
              flex-col
              overflow-hidden
              rounded-2xl
              bg-white
              shadow-2xl
            "
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-staff-title"
          >

            {/* MODAL HEADER */}

            <div className="flex items-start justify-between border-b border-mist px-4 py-3.5">

              <div className="flex items-center gap-2.5">

                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sage-light text-base text-sage-deep">
                  +
                </div>

                <div>

                  <h2
                    id="create-staff-title"
                    className="font-display text-lg font-semibold text-ink"
                  >
                    Create Staff Account
                  </h2>

                  <p className="mt-1 text-xs text-gray-500">
                    Add a new staff member to
                    the system.
                  </p>

                </div>

              </div>

              <button
                type="button"
                onClick={
                  closeCreateModal
                }
                disabled={loading}
                className="dashboard-icon-control flex h-9 w-9 items-center justify-center text-xl text-gray-500 transition-colors hover:text-ink disabled:opacity-50"
                aria-label="Close"
              >
                ×
              </button>

            </div>

            {/* MODAL FORM */}

            <form
              onSubmit={
                handleCreateStaff
              }
              className="flex min-h-0 flex-1 flex-col"
            >

              <div className="overflow-y-auto px-4 py-4">

                {/* ACCOUNT */}

                <div className="mb-5">

                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-sage">
                    Account Information
                  </h3>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

                    {/* USERNAME */}

                    <div>

                      <label
                        htmlFor="username"
                        className="mb-1.5 block text-xs font-semibold text-ink"
                      >
                        Username
                        <span className="ml-1 text-clay">
                          *
                        </span>
                      </label>

                      <div className="relative">
                      <input
                        id="username"
                        name="username"
                        type="text"
                        value={
                          form.username
                        }
                        onChange={
                          handleChange
                        }
                        placeholder="e.g. maria.santos"
                        autoComplete="off"
                        disabled={loading}
                        className="
                          w-full rounded-lg
                          border border-mist
                          bg-white
                          px-3 py-2
                          text-sm text-ink
                          outline-none
                          transition
                          placeholder:text-gray-400
                          focus:border-sage
                          focus:ring-2
                          focus:ring-sage-light
                          disabled:bg-gray-50
                        "
                      />

                      <p className="mt-1.5 text-[11px] text-gray-400">
                        Used for staff login.
                      </p>

                    </div>

                    </div>

                    {/* FULL NAME */}

                    <div>

                      <label
                        htmlFor="full_name"
                        className="mb-1.5 block text-xs font-semibold text-ink"
                      >
                        Full Name
                        <span className="ml-1 text-clay">
                          *
                        </span>
                      </label>

                      <input
                        id="full_name"
                        name="full_name"
                        type="text"
                        value={
                          form.full_name
                        }
                        onChange={
                          handleChange
                        }
                        placeholder="e.g. Maria Santos"
                        autoComplete="name"
                        disabled={loading}
                        className="
                          w-full rounded-lg
                          border border-mist
                          bg-white
                          px-3 py-2
                          text-sm text-ink
                          outline-none
                          transition
                          placeholder:text-gray-400
                          focus:border-sage
                          focus:ring-2
                          focus:ring-sage-light
                          disabled:bg-gray-50
                        "
                      />

                    </div>

                  </div>

                </div>

                {/* STAFF ROLE */}

                <div className="mb-5">

                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-sage">
                    Staff Assignment
                  </h3>

                  <div>

                    <label
                      htmlFor="staff_role"
                      className="mb-1.5 block text-xs font-semibold text-ink"
                    >
                      Staff Role
                      <span className="ml-1 text-clay">
                        *
                      </span>
                    </label>

                    <select
                      id="staff_role"
                      name="staff_role"
                      value={
                        form.staff_role
                      }
                      onChange={
                        handleChange
                      }
                      disabled={loading}
                      className="dashboard-filter-control w-full outline-none focus:border-sage focus:ring-2 focus:ring-sage-light disabled:bg-gray-50"
                    >

                      <option value="hairstylist">
                        Hairstylist
                      </option>

                      <option value="manicurist">Nail Technician</option>

                      <option value="receptionist">
                        Receptionist
                      </option>

                    </select>

                  </div>

                </div>

                {/* SECURITY */}

                <div>

                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-sage">
                    Security
                  </h3>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

                    {/* PASSWORD */}

                    <div>

                      <label
                        htmlFor="password"
                        className="mb-1.5 block text-xs font-semibold text-ink"
                      >
                        Password
                        <span className="ml-1 text-clay">
                          *
                        </span>
                      </label>

                      <div className="relative">
                        <input
                          id="password"
                          name="password"
                          type={showPassword ? "text" : "password"}
                          value={form.password}
                          onChange={handleChange}
                          placeholder="Minimum 8 characters"
                          autoComplete="new-password"
                          disabled={loading}
                          className="w-full rounded-lg border border-mist bg-white px-3 py-2 pr-12 text-sm text-ink outline-none focus:border-sage focus:ring-2 focus:ring-sage-light disabled:bg-gray-50"
                        />
                        <PasswordVisibilityButton
                          visible={showPassword}
                          onToggle={() => setShowPassword((visible) => !visible)}
                        />
                      </div>

                    </div>

                    {/* CONFIRM */}

                    <div>

                      <label
                        htmlFor="confirm_password"
                        className="mb-1.5 block text-xs font-semibold text-ink"
                      >
                        Confirm Password
                        <span className="ml-1 text-clay">
                          *
                        </span>
                      </label>

                      <div className="relative">
                        <input
                          id="confirm_password"
                          name="confirm_password"
                          type={showConfirmPassword ? "text" : "password"}
                          value={form.confirm_password}
                          onChange={handleChange}
                          placeholder="Re-enter password"
                          autoComplete="new-password"
                          disabled={loading}
                          className="w-full rounded-lg border border-mist bg-white px-3 py-2 pr-12 text-sm text-ink outline-none focus:border-sage focus:ring-2 focus:ring-sage-light disabled:bg-gray-50"
                        />
                        <PasswordVisibilityButton
                          visible={showConfirmPassword}
                          onToggle={() => setShowConfirmPassword((visible) => !visible)}
                        />
                      </div>

                    </div>

                  </div>

                  {/* SECURITY NOTE */}

                  <div className="mt-3 flex items-center gap-2.5 rounded-lg bg-gray-50 p-2.5">

                    <span className="text-sm">
                      🔒
                    </span>

                    <p className="text-[11px] leading-relaxed text-gray-500">
                      The password is securely
                      handled by Supabase
                      Authentication and is
                      never stored directly
                      in the staff profile.
                    </p>

                  </div>

                </div>

              </div>

              {/* =================================
                  MODAL FOOTER
              ================================= */}

              <div className="flex flex-col-reverse gap-2 border-t border-mist bg-gray-50/70 px-4 py-3 sm:flex-row sm:justify-end">

                <button
                  type="button"
                  onClick={
                    closeCreateModal
                  }
                  disabled={loading}
                  className="form-cancel-action rounded-lg px-4 py-2 text-sm font-semibold"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  className="
                    inline-flex
                    items-center
                    justify-center
                    gap-2
                    rounded-lg
                    dashboard-primary-action
                    px-4 py-2
                    text-sm font-semibold
                    transition
                    disabled:cursor-not-allowed
                    disabled:opacity-60
                  "
                >

                  {loading ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <span className="text-lg leading-none">
                        +
                      </span>

                      Create Account
                    </>
                  )}

                </button>

              </div>

            </form>

          </div>

        </div>,
        document.body,
      )}

    </div>
  );
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function formatStaffRole(
  role: StaffRole | null
): string {
  if (!role) {
    return "Unassigned";
  }

  if (role === "manicurist" || role === "pedicurist" || role === "nail_technician") {
    return "Nail Technician";
  }

  return role
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

function normalizeStaffRole(role: StaffRole | null): StaffRole {
  return role === "manicurist" || role === "pedicurist" || role === "nail_technician"
    ? "manicurist"
    : role ?? "hairstylist";
}

function getInitials(
  name: string
): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "?";
  }

  if (parts.length === 1) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    parts[0][0] +
    parts[parts.length - 1][0]
  ).toUpperCase();
}

function getRoleClasses(
  role: StaffRole | null
): string {
  switch (role) {
    case "hairstylist":
      return "bg-sage-light text-sage-deep";

    case "manicurist":
    case "pedicurist":
    case "nail_technician":
      return "bg-info-soft text-info";

    case "receptionist":
      return "bg-clay-light text-clay";

    default:
      return "bg-gray-100 text-gray-500";
  }
}