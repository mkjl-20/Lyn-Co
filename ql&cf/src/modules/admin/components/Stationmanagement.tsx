import { useEffect, useState } from "react";
import {
  fetchStations,
  createStation,
  updateStation,
  setStationActive,
  type StationRow,
  type StationInput,
} from "../services/stationService";
import { fetchStaffAccounts, type StaffAccountRow } from "../services/adminService";

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
    const previous = stations;
    setStations((current) => current.map((s) => (s.id === row.id ? { ...s, isActive: !s.isActive } : s)));
    try {
      await setStationActive(row.id, !row.isActive);
    } catch (error) {
      setStations(previous);
      setErrorMessage(error instanceof Error ? error.message : "Failed to update station.");
    }
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">Stations</h2>
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
        <p className="mt-6 text-sm text-ink/50">No stations yet.</p>
      ) : (
        <ul className="mt-6 space-y-2">
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
                  {station.homeStaffName ? `Owner: ${station.homeStaffName}` : "Unassigned"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggleActive(station)}
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    station.isActive ? "bg-sage-light text-sage-deep" : "bg-clay-light text-clay"
                  }`}
                >
                  {station.isActive ? "Active" : "Retired"}
                </button>
                <button
                  onClick={() => setEditingId(station.id)}
                  className="text-xs font-medium text-ink/60 hover:text-ink"
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
  onClose,
  onSaved,
}: {
  initial: StationRow | null;
  staff: StaffAccountRow[];
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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMessage(null);
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
            placeholder="Label (e.g. Station 1)"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            className="w-full rounded-lg border border-mist px-3 py-2 text-sm outline-none focus:border-sage"
          />
          <input
            required
            placeholder="Category (e.g. Hair, Nails)"
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className="w-full rounded-lg border border-mist px-3 py-2 text-sm outline-none focus:border-sage"
          />
          <select
            value={form.homeStaffId ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, homeStaffId: e.target.value || null }))}
            className="w-full rounded-lg border border-mist px-3 py-2 text-sm outline-none focus:border-sage"
          >
            <option value="">Unassigned</option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {member.fullName}
              </option>
            ))}
          </select>
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