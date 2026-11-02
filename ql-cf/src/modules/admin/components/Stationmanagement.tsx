import { useEffect, useState } from "react";
import {
  fetchStations,
  createStation,
  updateStation,
  setStationActive,
  setStationOutOfService,
  type StationRow,
  type StationInput,
} from "../services/stationService";
import { fetchStaffAccounts, type StaffAccountRow } from "../services/adminService";
import { StatusBadge } from "@/shared/components/StatusBadge";

const emptyForm: StationInput = { label: "", category: "", homeStaffId: null };

export function StationManagement() {
  const [stations, setStations] = useState<StationRow[]>([]);
  const [staff, setStaff] = useState<StaffAccountRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  async function loadAll() {
    setIsLoading(true);
    try {
      const [stationRows, staffRows] = await Promise.all([fetchStations(), fetchStaffAccounts()]);
      setStations(stationRows);
      setStaff(staffRows);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load stations.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleToggleActive(row: StationRow) {
    const nextIsActive = !row.isActive;
    if (!window.confirm(`${nextIsActive ? "Activate" : "Retire"} station "${row.label}"?`)) return;
    const previous = stations;
    setStations((current) => current.map((s) => (s.id === row.id ? { ...s, isActive: nextIsActive } : s)));
    try {
      await setStationActive(row.id, nextIsActive);
    } catch (error) {
      setStations(previous);
      setErrorMessage(error instanceof Error ? error.message : "Failed to update station.");
    }
  }

  async function handleToggleOutOfService(row: StationRow) {
    const reason = row.isOutOfService ? undefined : window.prompt(`Why is station "${row.label}" out of service?`)?.trim();
    if (!row.isOutOfService && !reason) return;
    if (row.isOutOfService && !window.confirm(`Restore station "${row.label}" to service?`)) return;
    setErrorMessage(null);
    try {
      await setStationOutOfService(row.id, !row.isOutOfService, reason);
      await loadAll();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update station availability.");
    }
  }

  return (
    <div className="rounded-xl border border-mist bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">Staff stations</h2>
        <button
          onClick={() => setIsCreating(true)}
          className="rounded-lg bg-sage-deep px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Add station
        </button>
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
    if (!window.confirm(`${action} station "${form.label.trim()}"?`)) return;
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
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
              className="flex-1 rounded-lg border border-mist py-2 text-sm font-medium text-ink/70"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 rounded-lg bg-sage-deep py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {isSubmitting ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}