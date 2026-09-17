import { useEffect, useMemo, useState } from "react";
import supabase from "../../../shared/lib/supabaseClient";

type StaffRole =
  | "receptionist"
  | "hairstylist"
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
        member.staff_role === roleFilter;

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
      console.log(
        "Creating staff account:",
        {
          username,
          fullName,
          staffRole: form.staff_role,
        }
      );

      const {
        data,
        error: functionError,
      } = await supabase.functions.invoke(
        "create-staff",
        {
          body: {
            username,
            full_name: fullName,
            staff_role: form.staff_role,
            password: form.password,
          },
        }
      );

      console.log(
        "Create staff response:",
        data
      );

      if (functionError) {
        console.error(
          "Create staff function error:",
          functionError
        );

        throw new Error(
          functionError.message ||
            "Unable to create staff account."
        );
      }

      if (!data?.success) {
        throw new Error(
          data?.error ||
            "Unable to create staff account."
        );
      }

      // -------------------------------
      // SUCCESS
      // -------------------------------

      await loadStaff();

      setShowCreateModal(false);

      setForm(initialForm);

      setSuccess(
        `${fullName} was successfully added as a ${formatStaffRole(
          form.staff_role
        )}.`
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

  // ==========================================
  // STATISTICS
  // ==========================================

  const totalStaff = staff.length;

  const activeStaff = staff.filter(
    (member) => member.is_active
  ).length;

  const inactiveStaff = staff.filter(
    (member) => !member.is_active
  ).length;

  // ==========================================
  // UI
  // ==========================================

  return (
    <div className="min-h-screen bg-porcelain text-ink">

      {/* ======================================
          PAGE HEADER
      ====================================== */}

      <div className="border-b border-mist bg-white">

        <div className="mx-auto max-w-7xl px-6 py-6 lg:px-8">

          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">

            <div className="flex items-center gap-4">

              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sage-light text-xl">
                👥
              </div>

              <div>

                <div className="mb-1 text-xs font-semibold tracking-wide text-sage">
                  ADMINISTRATION / STAFF
                </div>

                <h1 className="font-display text-3xl font-semibold text-ink">
                  Staff Management
                </h1>

                <p className="mt-1 text-sm text-gray-500">
                  Manage staff accounts, roles,
                  and access.
                </p>

              </div>

            </div>

            <button
              type="button"
              onClick={openCreateModal}
              className="
                inline-flex items-center justify-center
                gap-2 rounded-lg
                bg-sage px-5 py-3
                text-sm font-semibold text-white
                shadow-sm
                transition
                hover:bg-sage-deep
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

              Create Staff
            </button>

          </div>

        </div>

      </div>

      {/* ======================================
          MAIN CONTENT
      ====================================== */}

      <main className="mx-auto max-w-7xl px-6 py-7 lg:px-8">

        {/* ====================================
            SUCCESS MESSAGE
        ==================================== */}

        {success && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-sage/20 bg-sage-light p-4 text-sage-deep">

            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white font-bold">
              ✓
            </div>

            <div className="flex-1">

              <p className="text-sm font-semibold">
                Staff account created
              </p>

              <p className="mt-1 text-xs">
                {success}
              </p>

            </div>

            <button
              type="button"
              onClick={() => setSuccess("")}
              className="text-lg text-sage hover:text-sage-deep"
            >
              ×
            </button>

          </div>
        )}

        {/* ====================================
            ERROR MESSAGE
        ==================================== */}

        {error && !showCreateModal && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-clay/20 bg-clay-light p-4 text-clay">

            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white font-bold">
              !
            </div>

            <div className="flex-1">

              <p className="text-sm font-semibold">
                Something went wrong
              </p>

              <p className="mt-1 text-xs">
                {error}
              </p>

            </div>

            <button
              type="button"
              onClick={() => setError("")}
              className="text-lg text-clay"
            >
              ×
            </button>

          </div>
        )}

        {/* ====================================
            STATISTICS
        ==================================== */}

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">

          {/* TOTAL */}

          <div className="rounded-xl border border-mist bg-white p-5 shadow-sm">

            <div className="flex items-center justify-between">

              <div>

                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Total Staff
                </p>

                <p className="mt-2 text-3xl font-semibold text-ink">
                  {totalStaff}
                </p>

              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sage-light text-sage">
                👥
              </div>

            </div>

          </div>

          {/* ACTIVE */}

          <div className="rounded-xl border border-mist bg-white p-5 shadow-sm">

            <div className="flex items-center justify-between">

              <div>

                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Active
                </p>

                <p className="mt-2 text-3xl font-semibold text-sage-deep">
                  {activeStaff}
                </p>

              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sage-light text-sage">
                ✓
              </div>

            </div>

          </div>

          {/* INACTIVE */}

          <div className="rounded-xl border border-mist bg-white p-5 shadow-sm">

            <div className="flex items-center justify-between">

              <div>

                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Inactive
                </p>

                <p className="mt-2 text-3xl font-semibold text-gray-600">
                  {inactiveStaff}
                </p>

              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-500">
                ○
              </div>

            </div>

          </div>

        </div>

        {/* ====================================
            STAFF TABLE
        ==================================== */}

        <section className="overflow-hidden rounded-xl border border-mist bg-white shadow-sm">

          {/* TABLE HEADER */}

          <div className="border-b border-mist px-5 py-5 sm:px-6">

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

              <div>

                <h2 className="font-display text-xl font-semibold text-ink">
                  Staff Accounts
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  View and manage staff members
                  registered in the system.
                </p>

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

          <div className="flex flex-col gap-3 border-b border-mist bg-gray-50/50 p-4 sm:flex-row">

            {/* SEARCH */}

            <div className="relative flex-1">

              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                ⌕
              </span>

              <input
                type="search"
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
                placeholder="Search by name or username..."
                className="
                  w-full rounded-lg
                  border border-mist
                  bg-white
                  py-2.5 pl-9 pr-4
                  text-sm text-ink
                  outline-none
                  transition
                  placeholder:text-gray-400
                  focus:border-sage
                  focus:ring-2
                  focus:ring-sage-light
                "
              />

            </div>

            {/* ROLE FILTER */}

            <select
              value={roleFilter}
              onChange={(event) =>
                setRoleFilter(
                  event.target.value as
                    | "all"
                    | StaffRole
                )
              }
              className="
                rounded-lg
                border border-mist
                bg-white
                px-4 py-2.5
                text-sm text-ink
                outline-none
                focus:border-sage
                focus:ring-2
                focus:ring-sage-light
              "
            >
              <option value="all">
                All Staff Roles
              </option>

              <option value="hairstylist">
                Hairstylist
              </option>

              <option value="manicurist">
                Manicurist
              </option>

              <option value="pedicurist">
                Pedicurist
              </option>

              <option value="receptionist">
                Receptionist
              </option>
            </select>

          </div>

          {/* ==================================
              LOADING
          ================================== */}

          {loadingStaff ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center">

              <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-mist border-t-sage" />

              <p className="text-sm text-gray-500">
                Loading staff accounts...
              </p>

            </div>
          ) : (

            /* ==================================
               TABLE
            ================================== */

            <div className="overflow-x-auto">

              <table className="w-full min-w-[700px]">

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

                    <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-gray-400">
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

                          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sage-light text-xl">
                            👥
                          </div>

                          <h3 className="font-display text-lg font-semibold text-ink">
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
                                + Add Staff
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

                          <td className="px-6 py-4">

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

                                <p className="mt-0.5 text-xs text-gray-400">
                                  Staff member
                                </p>

                              </div>

                            </div>

                          </td>

                          {/* USERNAME */}

                          <td className="px-6 py-4">

                            <span className="rounded-md bg-gray-50 px-2 py-1 font-mono text-xs text-gray-600">
                              @
                              {
                                member.username
                              }
                            </span>

                          </td>

                          {/* ROLE */}

                          <td className="px-6 py-4">

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

                          <td className="px-6 py-4">

                            <span
                              className={`
                                inline-flex items-center gap-2
                                rounded-full
                                px-3 py-1.5
                                text-xs font-semibold
                                ${
                                  member.is_active
                                    ? "bg-sage-light text-sage-deep"
                                    : "bg-gray-100 text-gray-500"
                                }
                              `}
                            >

                              <span
                                className={`
                                  h-1.5 w-1.5 rounded-full
                                  ${
                                    member.is_active
                                      ? "bg-sage"
                                      : "bg-gray-400"
                                  }
                                `}
                              />

                              {member.is_active
                                ? "Active"
                                : "Inactive"}

                            </span>

                          </td>

                          {/* ACTION */}

                          <td className="px-6 py-4 text-right">

                            <button
                              type="button"
                              className="
                                rounded-lg
                                px-3 py-2
                                text-lg
                                text-gray-400
                                transition
                                hover:bg-sage-light
                                hover:text-sage-deep
                              "
                              title="More actions"
                            >
                              ⋮
                            </button>

                          </td>

                        </tr>
                      )
                    )

                  )}

                </tbody>

              </table>

            </div>
          )}

        </section>

      </main>

      {/* ======================================
          CREATE STAFF MODAL
      ====================================== */}

      {showCreateModal && (

        <div
          className="
            fixed inset-0 z-50
            flex items-center justify-center
            bg-ink/50
            p-4
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
              flex w-full max-w-2xl
              max-h-[calc(100vh-2rem)]
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

            <div className="flex items-start justify-between border-b border-mist px-6 py-5">

              <div className="flex items-center gap-3">

                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sage-light text-lg text-sage-deep">
                  +
                </div>

                <div>

                  <h2
                    id="create-staff-title"
                    className="font-display text-xl font-semibold text-ink"
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
                className="
                  flex h-9 w-9
                  items-center justify-center
                  rounded-lg
                  bg-gray-50
                  text-xl text-gray-500
                  hover:bg-gray-100
                  disabled:opacity-50
                "
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

              <div className="overflow-y-auto px-6 py-6">

                {/* ACCOUNT */}

                <div className="mb-7">

                  <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-sage">
                    Account Information
                  </h3>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

                    {/* USERNAME */}

                    <div>

                      <label
                        htmlFor="username"
                        className="mb-2 block text-xs font-semibold text-ink"
                      >
                        Username
                        <span className="ml-1 text-clay">
                          *
                        </span>
                      </label>

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
                          px-3.5 py-2.5
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

                    {/* FULL NAME */}

                    <div>

                      <label
                        htmlFor="full_name"
                        className="mb-2 block text-xs font-semibold text-ink"
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
                          px-3.5 py-2.5
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

                <div className="mb-7">

                  <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-sage">
                    Staff Assignment
                  </h3>

                  <div>

                    <label
                      htmlFor="staff_role"
                      className="mb-2 block text-xs font-semibold text-ink"
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
                      className="
                        w-full rounded-lg
                        border border-mist
                        bg-white
                        px-3.5 py-2.5
                        text-sm text-ink
                        outline-none
                        focus:border-sage
                        focus:ring-2
                        focus:ring-sage-light
                        disabled:bg-gray-50
                      "
                    >

                      <option value="hairstylist">
                        Hairstylist
                      </option>

                      <option value="manicurist">
                        Manicurist
                      </option>

                      <option value="pedicurist">
                        Pedicurist
                      </option>

                      <option value="receptionist">
                        Receptionist
                      </option>

                    </select>

                  </div>

                </div>

                {/* SECURITY */}

                <div>

                  <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-sage">
                    Security
                  </h3>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

                    {/* PASSWORD */}

                    <div>

                      <label
                        htmlFor="password"
                        className="mb-2 block text-xs font-semibold text-ink"
                      >
                        Password
                        <span className="ml-1 text-clay">
                          *
                        </span>
                      </label>

                      <input
                        id="password"
                        name="password"
                        type="password"
                        value={
                          form.password
                        }
                        onChange={
                          handleChange
                        }
                        placeholder="Minimum 8 characters"
                        autoComplete="new-password"
                        disabled={loading}
                        className="
                          w-full rounded-lg
                          border border-mist
                          bg-white
                          px-3.5 py-2.5
                          text-sm text-ink
                          outline-none
                          focus:border-sage
                          focus:ring-2
                          focus:ring-sage-light
                          disabled:bg-gray-50
                        "
                      />

                    </div>

                    {/* CONFIRM */}

                    <div>

                      <label
                        htmlFor="confirm_password"
                        className="mb-2 block text-xs font-semibold text-ink"
                      >
                        Confirm Password
                        <span className="ml-1 text-clay">
                          *
                        </span>
                      </label>

                      <input
                        id="confirm_password"
                        name="confirm_password"
                        type="password"
                        value={
                          form.confirm_password
                        }
                        onChange={
                          handleChange
                        }
                        placeholder="Re-enter password"
                        autoComplete="new-password"
                        disabled={loading}
                        className="
                          w-full rounded-lg
                          border border-mist
                          bg-white
                          px-3.5 py-2.5
                          text-sm text-ink
                          outline-none
                          focus:border-sage
                          focus:ring-2
                          focus:ring-sage-light
                          disabled:bg-gray-50
                        "
                      />

                    </div>

                  </div>

                  {/* SECURITY NOTE */}

                  <div className="mt-4 flex items-center gap-3 rounded-lg bg-gray-50 p-3">

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

                {/* FORM ERROR */}

                {error && (
                  <div className="mt-5 flex items-start gap-2 rounded-lg border border-clay/20 bg-clay-light p-3 text-xs text-clay">

                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white font-bold">
                      !
                    </span>

                    <span>
                      {error}
                    </span>

                  </div>
                )}

              </div>

              {/* =================================
                  MODAL FOOTER
              ================================= */}

              <div className="flex flex-col-reverse gap-2 border-t border-mist bg-gray-50/70 px-6 py-4 sm:flex-row sm:justify-end">

                <button
                  type="button"
                  onClick={
                    closeCreateModal
                  }
                  disabled={loading}
                  className="
                    rounded-lg
                    border border-mist
                    bg-white
                    px-5 py-2.5
                    text-sm font-semibold
                    text-gray-600
                    transition
                    hover:bg-gray-50
                    disabled:opacity-50
                  "
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
                    bg-sage
                    px-5 py-2.5
                    text-sm font-semibold
                    text-white
                    transition
                    hover:bg-sage-deep
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

        </div>

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

  return role
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
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
      return "bg-gold-light text-[#8a681e]";

    case "pedicurist":
      return "bg-[#edf2f3] text-[#4b686d]";

    case "receptionist":
      return "bg-clay-light text-clay";

    default:
      return "bg-gray-100 text-gray-500";
  }
}