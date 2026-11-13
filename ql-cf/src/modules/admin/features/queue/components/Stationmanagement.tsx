import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  fetchStations,
  createStation,
  updateStation,
  setStationActive,
  setStationOutOfService,
  fetchStationCoverageGrants,
  grantTemporaryStationCoverage,
  revokeStationCoverageGrant,
  type StationCoverageGrant,
  type StationRow,
  type StationInput,
} from "../services/stationService";
import { fetchStaffAccounts, type StaffAccountRow } from "../../staff/services/adminService";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { useFeedback } from "@/shared/components/FeedbackContext";

const emptyForm: StationInput = { label: "", category: "", homeStaffId: null };

function staffCanCoverStation(staffRole: string | null, category: string) {
  const normalizedCategory = category.toLowerCase();
  if (/hair|stylist|barber|color|make[\s_-]?up|brows?|eyebrows?|lash/.test(normalizedCategory)) {
    return staffRole === "hairstylist";
  }
  if (/nail|mani|pedi|foot/.test(normalizedCategory)) {
    return staffRole === "manicurist" || staffRole === "pedicurist" || staffRole === "nail_technician";
  }
  return false;
}

export function StationManagement() {
  const { confirm, notify } = useFeedback();
  const [stations, setStations] = useState<StationRow[]>([]);
  const [staff, setStaff] = useState<StaffAccountRow[]>([]);
  const [coverageGrants, setCoverageGrants] = useState<StationCoverageGrant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isGrantingCoverage, setIsGrantingCoverage] = useState(false);
  const [revokingGrantId, setRevokingGrantId] = useState<string | null>(null);

  async function loadAll() {
    setIsLoading(true);
    try {
      const [stationRows, staffRows] = await Promise.all([fetchStations(), fetchStaffAccounts()]);
      setStations(stationRows);
      setStaff(staffRows);
      setErrorMessage(null);
      try {
        setCoverageGrants(await fetchStationCoverageGrants());
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to load temporary station coverage.");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load stations.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (active) void loadAll();
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  async function handleRevokeCoverage(grant: StationCoverageGrant) {
    if (!await confirm({
      title: "Revoke temporary station coverage",
      message: `Revoke ${grant.staffName}'s temporary access to ${grant.stationLabel}?`,
      confirmLabel: "Revoke access",
      destructive: true,
    })) return;
    setRevokingGrantId(grant.id);
    setErrorMessage(null);
    try {
      await revokeStationCoverageGrant(grant.id);
      notify("success", `Temporary access to ${grant.stationLabel} was revoked.`);
      await loadAll();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to revoke temporary station coverage.");
    } finally {
      setRevokingGrantId(null);
    }
  }

  async function handleToggleActive(row: StationRow) {
    const nextIsActive = !row.isActive;
    if (!await confirm({
      title: `${nextIsActive ? "Activate" : "Retire"} station`,
      message: `${nextIsActive ? "Activate" : "Retire"} station "${row.label}"?`,
      confirmLabel: nextIsActive ? "Activate station" : "Retire station",
      destructive: !nextIsActive,
    })) return;
    const previous = stations;
    setStations((current) => current.map((s) => (s.id === row.id ? { ...s, isActive: nextIsActive } : s)));
    try {
      await setStationActive(row.id, nextIsActive);
      notify("success", `Station "${row.label}" ${nextIsActive ? "activated" : "retired"}.`);
    } catch (error) {
      setStations(previous);
      setErrorMessage(error instanceof Error ? error.message : "Failed to update station.");
    }
  }

  async function handleToggleOutOfService(row: StationRow) {
    const reason = row.isOutOfService ? undefined : window.prompt(`Why is station "${row.label}" out of service?`)?.trim();
    if (!row.isOutOfService && !reason) return;
    if (row.isOutOfService && !await confirm({
      title: "Restore station",
      message: `Restore station "${row.label}" to service?`,
      confirmLabel: "Restore station",
    })) return;
    setErrorMessage(null);
    try {
      await setStationOutOfService(row.id, !row.isOutOfService, reason);
      notify("success", `Station "${row.label}" ${row.isOutOfService ? "restored to service" : "marked out of service"}.`);
      await loadAll();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update station availability.");
    }
  }

  return (
    <div className="rounded-xl border border-mist bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">Staff stations</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setIsGrantingCoverage(true)}
            className="rounded-lg border border-sage/30 bg-white px-4 py-2 text-sm font-semibold text-sage-deep"
          >
            Authorize shortage cover
          </button>
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="dashboard-primary-action rounded-lg px-4 py-2 text-sm font-semibold"
          >
            Add station
          </button>
        </div>
      </div>
      {errorMessage && (
        <p role="alert" className="mt-3 text-sm text-clay">
          {errorMessage}
        </p>
      )}

      {isLoading ? (
        <div className="mt-6 space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-porcelain" />
          ))}
        </div>
      ) : stations.length === 0 ? (
        <p className="mt-6 text-sm text-ink/50">No staff stations yet.</p>
      ) : (
        <ul className="mt-6 max-h-80 space-y-2 overflow-y-auto pr-2">
          {stations.map((station) => (
            <li
              key={station.id}
              className="flex items-center justify-between rounded-lg border border-mist/60 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-ink">
                  {station.label} <span className="text-xs text-ink/40">· {station.category}</span>
                </p>
                <p className="text-xs text-ink/50">
                  {station.homeStaffName ? `Assigned to: ${station.homeStaffName}` : "Unassigned"}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <StatusBadge status={station.isOutOfService ? "unavailable" : station.isActive ? "active" : "retired"}>
                    {station.isOutOfService ? "Out of service" : station.isActive ? "Active" : "Retired"}
                  </StatusBadge>
                  {station.isOutOfService && station.outOfServiceReason && (
                    <span className="text-xs text-danger">{station.outOfServiceReason}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!station.isOutOfService && (
                  <button
                    type="button"
                    onClick={() => handleToggleActive(station)}
                    className="rounded-lg border border-mist px-3 py-2 text-xs font-semibold text-ink/70 transition-colors hover:bg-sage-light"
                  >
                    {station.isActive ? "Retire" : "Activate"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleToggleOutOfService(station)}
                  className="rounded-full border border-mist px-2 py-1 text-xs font-medium text-ink/70 hover:bg-porcelain"
                >
                  {station.isOutOfService ? "Restore" : "Take offline"}
                </button>
                <button
                  onClick={() => setEditingId(station.id)}
                  className="ui-action-edit rounded px-2 py-1 text-xs font-medium"
                >
                  Edit
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-5 border-t border-mist pt-4" aria-labelledby="temporary-coverage-title">
        <h3 id="temporary-coverage-title" className="text-sm font-semibold text-ink">Temporary shortage coverage</h3>
        {coverageGrants.length === 0 ? (
          <p className="mt-2 text-xs text-ink/50">No active temporary station authorizations.</p>
        ) : (
          <ul className="mt-2 grid gap-2">
            {coverageGrants.map((grant) => (
              <li key={grant.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-mist/70 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{grant.staffName} · {grant.stationLabel}</p>
                  <p className="text-xs text-ink/55">{grant.reason} · Ends {new Date(grant.expiresAt).toLocaleTimeString()}</p>
                </div>
                <button
                  type="button"
                  disabled={revokingGrantId === grant.id}
                  onClick={() => void handleRevokeCoverage(grant)}
                  className="ui-action-danger rounded px-2 py-1 text-xs font-semibold disabled:opacity-50"
                >
                  {revokingGrantId === grant.id ? "Revoking…" : "Revoke"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isGrantingCoverage && (
        <StationCoverageGrantDialog
          stations={stations}
          staff={staff}
          onClose={() => setIsGrantingCoverage(false)}
          onSaved={() => {
            setIsGrantingCoverage(false);
            void loadAll();
          }}
        />
      )}

      {(isCreating || editingId) && (
        <StationFormDialog
          initial={editingId ? stations.find((s) => s.id === editingId) ?? null : null}
          staff={staff}
          stations={stations}
          onClose={() => {
            setIsCreating(false);
            setEditingId(null);
          }}
          onSaved={() => {
            setIsCreating(false);
            setEditingId(null);
            loadAll();
          }}
        />
      )}
    </div>
  );
}

function StationCoverageGrantDialog({
  stations,
  staff,
  onClose,
  onSaved,
}: {
  stations: StationRow[];
  staff: StaffAccountRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [stationId, setStationId] = useState(
    stations.find((station) => station.isActive && !station.isOutOfService)?.id ?? "",
  );
  const [staffId, setStaffId] = useState("");
  const [durationHours, setDurationHours] = useState(4);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const selectedStation = stations.find((station) => station.id === stationId);
  const eligibleStaff = staff.filter((member) =>
    member.accountRole === "staff"
    && member.staffRole !== "receptionist"
    && selectedStation
    && staffCanCoverStation(member.staffRole, selectedStation.category)
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMessage(null);
    if (!stationId || !staffId || reason.trim().length < 3) {
      setErrorMessage("Select a qualified staff member and enter why they are covering.");
      return;
    }
    setIsSubmitting(true);
    try {
      await grantTemporaryStationCoverage({
        stationId,
        staffId,
        durationHours,
        reason: reason.trim(),
      });
      onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to authorize temporary station coverage.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-ink/40 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="coverage-grant-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h3 id="coverage-grant-title" className="font-display text-lg font-semibold text-ink">Authorize shortage cover</h3>
        <p className="mt-1 text-xs text-ink/55">This grants station access temporarily and is recorded for audit.</p>
        <form onSubmit={(event) => void handleSubmit(event)} className="mt-4 space-y-3">
          {errorMessage && <p role="alert" className="text-sm text-clay">{errorMessage}</p>}
          <label className="block text-xs font-medium text-ink/65">Station
            <select required value={stationId} onChange={(event) => { setStationId(event.target.value); setStaffId(""); }} className="dashboard-filter-control mt-1 w-full">
              <option value="">Choose an active station</option>
              {stations.filter((station) => station.isActive && !station.isOutOfService).map((station) => (
                <option key={station.id} value={station.id}>{station.label} · {station.category}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-ink/65">Qualified staff member
            <select required value={staffId} onChange={(event) => setStaffId(event.target.value)} className="dashboard-filter-control mt-1 w-full">
              <option value="">Choose staff</option>
              {eligibleStaff.map((member) => <option key={member.id} value={member.id}>{member.fullName}</option>)}
            </select>
          </label>
          <label className="block text-xs font-medium text-ink/65">Authorization duration
            <select value={durationHours} onChange={(event) => setDurationHours(Number(event.target.value))} className="dashboard-filter-control mt-1 w-full">
              {[2, 4, 8].map((hours) => <option key={hours} value={hours}>{hours} hours</option>)}
            </select>
          </label>
          <label className="block text-xs font-medium text-ink/65">Shortage reason
            <textarea required minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-mist p-2 text-sm text-ink" placeholder="Why is temporary coverage needed?" />
          </label>
          <div className="flex gap-2 pt-1">
            <button type="button" disabled={isSubmitting} onClick={onClose} className="form-cancel-action flex-1 rounded-lg px-3 text-sm font-semibold">Cancel</button>
            <button type="submit" disabled={isSubmitting || !stationId || !staffId} className="dashboard-primary-action flex-1 rounded-lg px-3 text-sm font-semibold disabled:opacity-50">{isSubmitting ? "Authorizing…" : "Authorize cover"}</button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}

function StationFormDialog({
  initial,
  staff,
  stations,
  onClose,
  onSaved,
}: {
  initial: StationRow | null;
  staff: StaffAccountRow[];
  stations: StationRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { confirm } = useFeedback();
  const [form, setForm] = useState<StationInput>(
    initial
      ? { label: initial.label, category: initial.category, homeStaffId: initial.homeStaffId }
      : emptyForm
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const assignedStaffIds = new Set(
    stations
      .filter((station) => station.isActive && station.id !== initial?.id && station.homeStaffId)
      .map((station) => station.homeStaffId)
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMessage(null);
    const action = initial ? "Save changes to" : "Add";
    if (!await confirm({
      title: initial ? "Save station changes" : "Add station",
      message: `${action} station "${form.label.trim()}"?`,
      confirmLabel: initial ? "Save changes" : "Add station",
    })) return;
    setIsSubmitting(true);
    try {
      if (initial) {
        await updateStation(initial.id, form);
      } else {
        await createStation(form);
      }
      onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save station.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="font-display text-base font-semibold text-ink">
          {initial ? "Edit station" : "Add station"}
        </h3>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          {errorMessage && <p className="text-xs text-clay">{errorMessage}</p>}
          <input
            required
            placeholder="Station label"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            className="w-full rounded-lg border border-mist px-3 py-2 text-sm outline-none focus:border-sage"
          />
          <input
            required
            placeholder="Staff station category"
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className="w-full rounded-lg border border-mist px-3 py-2 text-sm outline-none focus:border-sage"
          />
          <select
            value={form.homeStaffId ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, homeStaffId: e.target.value || null }))}
            className="dashboard-filter-control w-full outline-none focus:border-sage"
            aria-label="Staff member assigned to this station"
          >
            <option value="">Unassigned station</option>
            {staff.filter((member) => !assignedStaffIds.has(member.id)).map((member) => (
              <option key={member.id} value={member.id}>
                {member.fullName}
              </option>
            ))}
          </select>
          <p className="text-xs text-ink/50">Assigned staff can only start services at their mapped station.</p>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="form-cancel-action flex-1 rounded-lg py-2 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="dashboard-primary-action flex-1 rounded-lg py-2 text-sm font-semibold disabled:opacity-40"
            >
              {isSubmitting ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}