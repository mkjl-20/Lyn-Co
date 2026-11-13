import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { apiRequest } from "@/shared/lib/apiClient";

interface ForecastEvent {
  id: string;
  event_date: string;
  title: string;
  event_type: "holiday" | "promotion" | "custom";
  demand_multiplier: number;
  notes: string | null;
}

function localDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function ForecastEventsPanel() {
  const [events, setEvents] = useState<ForecastEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [eventDate, setEventDate] = useState(() => localDate(new Date()));
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState<ForecastEvent["event_type"]>("holiday");
  const [demandMultiplier, setDemandMultiplier] = useState("1.2");
  const [notes, setNotes] = useState("");

  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result = await apiRequest<{ events: ForecastEvent[] }>("/api/admin/workspace/forecast-events");
      setEvents(result.events);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load forecast events.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Load events when the forecasting section is mounted.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadEvents();
  }, [loadEvents]);

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const result = await apiRequest<{ event: ForecastEvent }>("/api/admin/workspace/forecast-events", {
        method: "POST",
        body: JSON.stringify({
          eventDate,
          title,
          eventType,
          demandMultiplier: Number(demandMultiplier),
          notes,
        }),
      });
      setEvents((current) => [...current, result.event].sort((a, b) => a.event_date.localeCompare(b.event_date)));
      setTitle("");
      setNotes("");
      setShowForm(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save the forecast event.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteEvent(forecastEvent: ForecastEvent) {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await apiRequest(`/api/admin/workspace/forecast-events/${forecastEvent.id}`, { method: "DELETE" });
      setEvents((current) => current.filter((event) => event.id !== forecastEvent.id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to delete the forecast event.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="h-full overflow-hidden rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">Forecast events</h2>
            <p className="mt-1 text-xs text-[var(--app-ink-muted)]">Schedule holidays and promotions that adjust predicted customer demand.</p>
          </div>
          <button type="button" onClick={() => setShowForm(true)} className="dashboard-primary-action min-h-9 rounded-lg px-3 text-xs font-semibold">Add forecast event</button>
        </div>
        {errorMessage && (
          <div role="alert" className="mt-3 flex shrink-0 items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <span>{errorMessage}</span>
            <button type="button" onClick={() => void loadEvents()} className="min-h-8 shrink-0 rounded-md px-2 font-semibold">Retry</button>
          </div>
        )}
        {isLoading ? (
          <p className="py-6 text-sm text-[var(--app-ink-muted)]">Loading forecast events…</p>
        ) : events.length === 0 ? (
          <p className="py-6 text-sm text-[var(--app-ink-muted)]">No forecast events have been added.</p>
        ) : (
          <ul className="mt-3 min-h-0 space-y-2 overflow-y-auto">
            {events.map((forecastEvent) => (
              <li key={forecastEvent.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 p-3">
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--color-ink)]">{forecastEvent.title}</p>
                  <p className="mt-1 text-xs capitalize text-[var(--app-ink-muted)]">{forecastEvent.event_date} · {forecastEvent.event_type} · ×{Number(forecastEvent.demand_multiplier).toFixed(1)}</p>
                  {forecastEvent.notes && <p className="mt-1 text-xs text-[var(--app-ink-muted)]">{forecastEvent.notes}</p>}
                </div>
                <button type="button" disabled={isSaving} onClick={() => void deleteEvent(forecastEvent)} className="ui-action-danger min-h-9 rounded-lg border border-neutral-200 px-3 text-xs font-semibold disabled:opacity-50">Delete</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {showForm && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) setShowForm(false); }}>
          <form role="dialog" aria-modal="true" aria-labelledby="forecast-event-title" onSubmit={(event) => void createEvent(event)} className="max-h-[92dvh] w-full max-w-lg space-y-3 overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Analytics &amp; Forecasting</p><h3 id="forecast-event-title" className="mt-1 font-display text-xl font-semibold">Add forecast event</h3></div>
              <button type="button" aria-label="Close dialog" disabled={isSaving} onClick={() => setShowForm(false)} className="rounded-lg px-2 text-xl text-neutral-500 hover:bg-neutral-100">×</button>
            </div>
            <p className="text-sm text-neutral-600">Set an expected demand adjustment for an event date.</p>
            <label className="block text-xs font-medium text-neutral-600">Date
              <input required type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} className="dashboard-filter-control mt-1 block w-full text-ink" />
            </label>
            <label className="block text-xs font-medium text-neutral-600">Event name
              <input required maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} className="dashboard-filter-control mt-1 block w-full text-ink" placeholder="e.g. Holiday weekend" />
            </label>
            <label className="block text-xs font-medium text-neutral-600">Event type
              <select value={eventType} onChange={(event) => setEventType(event.target.value as ForecastEvent["event_type"])} className="dashboard-filter-control mt-1 block w-full text-ink">
                <option value="holiday">Holiday</option><option value="promotion">Promotion</option><option value="custom">Other event</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-neutral-600">Forecast demand multiplier (0.1–5)
              <input required type="number" min="0.1" max="5" step="0.1" value={demandMultiplier} onChange={(event) => setDemandMultiplier(event.target.value)} className="dashboard-filter-control mt-1 block w-full text-ink" />
            </label>
            <label className="block text-xs font-medium text-neutral-600">Notes (optional)
              <textarea maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-ink" />
            </label>
            {errorMessage && <p role="alert" className="text-xs text-red-700">{errorMessage}</p>}
            <div className="flex justify-end gap-2 border-t border-neutral-200 pt-3">
              <button type="button" disabled={isSaving} onClick={() => setShowForm(false)} className="min-h-10 rounded-lg border border-neutral-200 px-4 text-sm font-semibold text-neutral-700">Cancel</button>
              <button type="submit" disabled={isSaving} className="dashboard-primary-action min-h-10 rounded-lg px-4 text-sm font-semibold disabled:opacity-50">{isSaving ? "Saving…" : "Save forecast event"}</button>
            </div>
          </form>
        </div>,
        document.body,
      )}
    </section>
  );
}
