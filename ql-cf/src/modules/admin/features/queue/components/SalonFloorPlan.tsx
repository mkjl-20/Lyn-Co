import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import { DoorOpen, MapPinned, Move, RotateCcw, Store, UserRound } from "lucide-react";
import {
  fetchActiveQueue,
  subscribeToQueueChanges,
  type QueueEntryRow,
} from "../services/queueAdminService";
import { fetchStaffAccounts, type StaffAccountRow } from "../../staff/services/adminService";
import { fetchStations, type StationRow } from "../services/stationService";
import { formatTicketNumber } from "@/shared/lib/ticketNumber";
import { useFeedback } from "@/shared/components/FeedbackContext";

interface FloorPosition {
  x: number;
  y: number;
}

type FloorPositions = Record<string, FloorPosition>;

const LAYOUT_STORAGE_KEY = "lynq.salon-floor-plan.v2";
const FLOOR_WIDTH = 1400;
const FLOOR_HEIGHT = 1130;

function drawingPosition(x: number, y: number): FloorPosition {
  return {
    x: Number(((x - 150) / FLOOR_WIDTH * 100).toFixed(1)),
    y: Number(((y - 110) / FLOOR_HEIGHT * 100).toFixed(1)),
  };
}

function defaultStationPosition(station: StationRow, index: number, stations: StationRow[]): FloorPosition {
  const lane = station.category.toLowerCase();
  const laneStations = stations.filter((item) => item.category.toLowerCase() === lane);
  const laneIndex = laneStations.findIndex((item) => item.id === station.id);
  if (/hair|stylist|barber|color/.test(lane)) {
    const diagonalStations = [
      { x: 373, y: 880 },
      { x: 461, y: 782 },
      { x: 552, y: 685 },
      { x: 634, y: 592 },
      { x: 710, y: 505 },
      { x: 820, y: 783 },
      { x: 818, y: 917 },
    ];
    const point = diagonalStations[laneIndex % diagonalStations.length];
    return drawingPosition(point.x, point.y);
  }
  if (/nail|mani|pedi/.test(lane)) {
    const points = [{ x: 1259, y: 691 }, { x: 1255, y: 846 }, { x: 1252, y: 985 }];
    const point = points[laneIndex % points.length];
    return drawingPosition(point.x, point.y);
  }
  if (/shampoo|wash/.test(lane)) {
    const point = { x: 1365, y: 235 + (laneIndex % 2) * 125 };
    return drawingPosition(point.x, point.y);
  }
  return drawingPosition(1030 + (index % 2) * 100, 760 + Math.floor(index / 2) * 100);
}

function isFloorPosition(value: unknown): value is FloorPosition {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.x === "number" && Number.isFinite(candidate.x)
    && typeof candidate.y === "number" && Number.isFinite(candidate.y)
    && candidate.x >= 4 && candidate.x <= 96
    && candidate.y >= 6 && candidate.y <= 94;
}

function readFloorLayout(): { positions: FloorPositions; errorMessage: string | null } {
  try {
    const savedLayout = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!savedLayout) return { positions: {}, errorMessage: null };

    const parsed: unknown = JSON.parse(savedLayout);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { positions: {}, errorMessage: "Saved salon map positions are invalid. Reset the layout to continue." };
    }

    const positions: FloorPositions = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (isFloorPosition(value)) positions[key] = value;
    }
    return { positions, errorMessage: null };
  } catch (error) {
    return {
      positions: {},
      errorMessage: error instanceof Error ? error.message : "Unable to read the saved salon map layout.",
    };
  }
}

function stationKey(id: string) {
  return `station:${id}`;
}

function mapPointerToPosition(event: { clientX: number; clientY: number }, map: HTMLElement): FloorPosition {
  const bounds = map.getBoundingClientRect();
  return {
    x: Math.min(96, Math.max(4, Number(((event.clientX - bounds.left) / bounds.width * 100).toFixed(1)))),
    y: Math.min(94, Math.max(6, Number(((event.clientY - bounds.top) / bounds.height * 100).toFixed(1)))),
  };
}

export function SalonFloorPlan() {
  const { confirm } = useFeedback();
  const [initialLayout] = useState(readFloorLayout);
  const [stations, setStations] = useState<StationRow[]>([]);
  const [entries, setEntries] = useState<QueueEntryRow[]>([]);
  const [staff, setStaff] = useState<StaffAccountRow[]>([]);
  const [positions, setPositions] = useState<FloorPositions>(initialLayout.positions);
  const [isEditingLayout, setIsEditingLayout] = useState(false);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [layoutError, setLayoutError] = useState<string | null>(initialLayout.errorMessage);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const mapRef = useRef<HTMLDivElement>(null);

  const loadMap = useCallback(async () => {
    try {
      const [queueEntries, stationRows, staffRows] = await Promise.all([
        fetchActiveQueue(),
        fetchStations(),
        fetchStaffAccounts(),
      ]);
      setEntries(queueEntries);
      setStations(stationRows);
      setStaff(staffRows);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load the salon floor plan.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const initialLoad = window.setTimeout(() => void loadMap(), 0);
    const unsubscribe = subscribeToQueueChanges(() => {
      if (mounted) void loadMap();
    });
    const timer = window.setInterval(() => {
      if (mounted) {
        setCurrentTime(Date.now());
        void loadMap();
      }
    }, 15_000);
    return () => {
      mounted = false;
      window.clearTimeout(initialLoad);
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [loadMap]);

  function saveLayout(nextPositions: FloorPositions) {
    try {
      window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(nextPositions));
      setLayoutError(null);
    } catch (error) {
      setLayoutError(error instanceof Error ? error.message : "Unable to save the salon map layout.");
    }
  }

  const activeServiceByStation = useMemo(() => {
    const assignments = new Map<string, { entry: QueueEntryRow; service: QueueEntryRow["services"][number] }>();
    for (const entry of entries) {
      for (const service of entry.services) {
        if (service.status === "in_service" && service.stationId) {
          assignments.set(service.stationId, { entry, service });
        }
      }
    }
    return assignments;
  }, [entries]);

  const reservedServiceByStation = useMemo(() => {
    const assignments = new Map<string, { entry: QueueEntryRow; service: QueueEntryRow["services"][number] }>();
    for (const entry of entries) {
      for (const service of entry.services) {
        if (service.status !== "pending" || !service.stationId) continue;
        if (service.stationReservedUntil && Date.parse(service.stationReservedUntil) <= currentTime) continue;
        if (!assignments.has(service.stationId)) assignments.set(service.stationId, { entry, service });
      }
    }
    return assignments;
  }, [currentTime, entries]);

  const selectedStation = stations.find((station) => stationKey(station.id) === selectedItem) ?? null;
  const selectedStationService = selectedStation
    ? activeServiceByStation.get(selectedStation.id) ?? reservedServiceByStation.get(selectedStation.id) ?? null
    : null;
  const activeStationCount = stations.filter((station) => station.isActive).length;

  function moveMarker(key: string, position: FloorPosition) {
    const nextPositions = { ...positions, [key]: position };
    setPositions(nextPositions);
  }

  function handleMarkerPointerDown(event: PointerEvent<HTMLButtonElement>, key: string) {
    if (!isEditingLayout) return;
    event.preventDefault();
    event.stopPropagation();
    setDraggingKey(key);
    mapRef.current?.setPointerCapture(event.pointerId);
    if (mapRef.current) moveMarker(key, mapPointerToPosition(event, mapRef.current));
  }

  function handleMapPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (draggingKey && mapRef.current) moveMarker(draggingKey, mapPointerToPosition(event, mapRef.current));
  }

  function handleMapPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (draggingKey && mapRef.current) {
      const position = mapPointerToPosition(event, mapRef.current);
      const nextPositions = { ...positions, [draggingKey]: position };
      setPositions(nextPositions);
      saveLayout(nextPositions);
    }
    setDraggingKey(null);
    if (mapRef.current?.hasPointerCapture(event.pointerId)) mapRef.current.releasePointerCapture(event.pointerId);
  }

  function handleMarkerKeyDown(event: KeyboardEvent<HTMLButtonElement>, key: string, position: FloorPosition) {
    if (!isEditingLayout) return;
    const step = event.altKey ? 0.1 : 1;
    const next = { ...position };
    if (event.key === "ArrowLeft") next.x -= step;
    else if (event.key === "ArrowRight") next.x += step;
    else if (event.key === "ArrowUp") next.y -= step;
    else if (event.key === "ArrowDown") next.y += step;
    else return;
    event.preventDefault();
    const nextPosition = {
      x: Math.min(96, Math.max(4, Number(next.x.toFixed(1)))),
      y: Math.min(94, Math.max(6, Number(next.y.toFixed(1)))),
    };
    moveMarker(key, nextPosition);
    saveLayout({ ...positions, [key]: nextPosition });
  }

  async function resetLayout() {
    if (!await confirm({
      title: "Reset salon floor plan",
      message: "Reset all station positions to the suggested salon layout?",
      confirmLabel: "Reset layout",
      destructive: true,
    })) return;
    setPositions({});
    saveLayout({});
  }

  const activeCount = activeServiceByStation.size;
  if (isLoading) {
    return <div className="h-72 animate-pulse rounded-2xl bg-[var(--app-surface)] shadow-[var(--app-shadow)]" role="status">Loading salon map…</div>;
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] shadow-[var(--app-shadow)]">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--app-border)] px-5 py-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--app-ink-muted)]">Operations</p>
          <h2 className="mt-1 font-display text-xl font-semibold text-[var(--color-ink)]">Salon floor map</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--app-ink-muted)]">See live station availability. Arrange markers to match your salon’s real layout.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isEditingLayout ? (
            <>
              <button type="button" onClick={resetLayout} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--app-border)] px-3 text-sm font-semibold text-[var(--color-ink)] transition hover:bg-[var(--app-surface-soft)]">
                <RotateCcw size={15} aria-hidden="true" /> Reset positions
              </button>
              <button type="button" onClick={() => { setIsEditingLayout(false); setDraggingKey(null); }} className="min-h-10 rounded-lg bg-[var(--app-accent)] px-4 text-sm font-semibold text-white transition hover:opacity-90">
                Done
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setIsEditingLayout(true)} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--app-accent)] px-4 text-sm font-semibold text-white transition hover:opacity-90">
              <Move size={15} aria-hidden="true" /> Arrange floor plan
            </button>
          )}
        </div>
      </header>

      {(errorMessage || layoutError) && <div role="alert" className="mx-5 mt-4 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-soft)] px-3 py-2 text-sm text-[var(--color-ink)]">{errorMessage}{errorMessage && layoutError ? " " : ""}{layoutError}</div>}

      <div className="space-y-5 p-4 sm:p-5">
        <div className="min-w-0">
          <div
            ref={mapRef}
            className={`relative aspect-[1400/1130] touch-none select-none overflow-hidden rounded-xl border border-[var(--app-border)] bg-white ${isEditingLayout ? "cursor-crosshair" : ""}`}
            onPointerMove={handleMapPointerMove}
            onPointerUp={handleMapPointerUp}
            onPointerCancel={handleMapPointerUp}
            aria-label="Salon floor plan. Drag markers to position them when arrange mode is enabled."
          >
            <svg viewBox="150 110 1400 1130" className="absolute inset-0 h-full w-full" role="img" aria-label="Salon floor plan with hair stations, nail area, shampoo beds, front desk, and entrance">
              <defs>
                <clipPath id="salon-room-clip">
                  <polygon points="195,930 690,400 1095,290 1220,150 1490,153 1495,540 1333,533 1335,1185 203,1165" />
                </clipPath>
              </defs>
              <rect x="150" y="110" width="1400" height="1130" fill="#fff" />
              <polygon points="195,930 690,400 1095,290 1220,150 1490,153 1495,540 1333,533 1335,1185 203,1165" fill="#fbfbfb" stroke="#242424" strokeWidth="9" strokeLinejoin="round" />
              <g clipPath="url(#salon-room-clip)">
                <polygon points="195,930 690,400 890,606 890,1000 335,1000 335,960 195,960" fill="#e4dcf6" opacity=".72" />
                <polygon points="195,960 335,960 335,1005 1075,1005 1075,1190 195,1190" fill="#d3ecd5" opacity=".72" />
                <rect x="1165" y="545" width="170" height="515" fill="#f9d8e4" opacity=".72" />
                <rect x="895" y="430" width="240" height="275" fill="#f2e2b8" opacity=".72" />
                <rect x="1290" y="150" width="210" height="390" fill="#cfe4f6" opacity=".72" />

                <rect x="880" y="700" width="14" height="305" rx="3" fill="#1d1d1f" />

                <g transform="translate(1015 582) scale(.78) translate(-1015 -560)">
                  <rect x="890" y="520" width="250" height="26" rx="4" fill="#1d1d1f" />
                  <rect x="905" y="572" width="220" height="93" rx="10" fill="#fff" stroke="#8a8a90" strokeWidth="3" />
                  <line x1="1015" y1="578" x2="1015" y2="660" stroke="#c9c9ce" strokeWidth="3" />
                </g>

                <g fill="#ededef" stroke="#c9c9ce" strokeWidth="3" aria-label="Customer lounge seating area">
                  <rect x="220" y="975" width="86" height="118" rx="14" />
                  <rect x="345" y="1070" width="150" height="80" rx="14" />
                  <rect x="550" y="1070" width="150" height="80" rx="14" />
                  <rect x="895" y="1070" width="150" height="80" rx="14" />
                </g>

                <g>
                  <rect x="1303" y="191" width="124" height="88" rx="14" fill="#fff" stroke="#8a8a90" strokeWidth="3" />
                  <rect x="1313" y="201" width="104" height="68" rx="10" fill="#dbe9f5" />
                  <rect x="1313" y="201" width="30" height="68" rx="10" fill="#b9d3ea" />
                  <rect x="1303" y="316" width="124" height="88" rx="14" fill="#fff" stroke="#8a8a90" strokeWidth="3" />
                  <rect x="1313" y="326" width="104" height="68" rx="10" fill="#dbe9f5" />
                  <rect x="1313" y="326" width="30" height="68" rx="10" fill="#b9d3ea" />
                </g>

                <text x="630" y="830" textAnchor="middle" fill="#1d1d1f" fontSize="22" fontWeight="700" letterSpacing="2" transform="rotate(-90 630 830)">HAIR AREA</text>
                <text x="1192" y="802" textAnchor="middle" fill="#1d1d1f" fontSize="22" fontWeight="700" letterSpacing="2" transform="rotate(-90 1192 802)">NAIL AREA</text>
                <text x="1450" y="345" textAnchor="middle" fill="#1d1d1f" fontSize="20" fontWeight="700" letterSpacing="2" transform="rotate(-90 1450 345)">SHAMPOO AREA</text>
                <text x="1015" y="485" textAnchor="middle" fill="#1d1d1f" fontSize="22" fontWeight="700" letterSpacing="2">FRONT DESK</text>
                <text x="625" y="1036" textAnchor="middle" fill="#1d1d1f" fontSize="20" fontWeight="700" letterSpacing="2">CUSTOMER LOUNGE</text>
              </g>

              <line x1="1103" y1="1181" x2="1188" y2="1183" stroke="#fff" strokeWidth="12" />
              <path d="M1100 1181L1100 1096A85 85 0 0 1 1185 1182" fill="none" stroke="#8a8a90" strokeWidth="3" strokeDasharray="8 6" />
              <text x="1145" y="1220" textAnchor="middle" fill="#6e6e73" fontSize="22">Entrance</text>
            </svg>

            {stations.map((station, index) => {
              const key = stationKey(station.id);
              const position = positions[key] ?? defaultStationPosition(station, index, stations);
              const assignment = activeServiceByStation.get(station.id);
              const reservation = reservedServiceByStation.get(station.id);
              const isSelected = selectedItem === key;
              const statusLabel = !station.isActive
                ? "Unavailable"
                : assignment
                  ? "In use"
                  : reservation
                    ? "Reserved"
                    : "Available";
              const statusStyle = statusLabel === "Unavailable"
                ? "border-[#b8b8bd] bg-[#f2f2f3] text-[#66666d]"
                : statusLabel === "In use"
                  ? "border-[#202124] bg-[#202124] text-white"
                  : statusLabel === "Reserved"
                    ? "border-amber-500 bg-amber-100 text-amber-900"
                    : "border-emerald-700 bg-white text-emerald-800";
              return (
                <button
                  key={key}
                  type="button"
                  aria-label={`${station.label}, ${station.category}, ${statusLabel}${assignment || reservation ? `: ${(assignment ?? reservation)?.entry.customerName}` : ""}${isEditingLayout ? ". Drag or use arrow keys to reposition" : ""}`}
                  title={`${station.label} · ${station.category} · ${statusLabel}${assignment || reservation ? ` · ${(assignment ?? reservation)?.entry.customerName} · ${(assignment ?? reservation)?.service.name}` : ""}`}
                  onClick={() => { if (!isEditingLayout) setSelectedItem(key); }}
                  onPointerDown={(event) => handleMarkerPointerDown(event, key)}
                  onKeyDown={(event) => handleMarkerKeyDown(event, key, position)}
                  style={{ left: `${position.x}%`, top: `${position.y}%` }}
                  className={`absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 rounded-md border-0 bg-transparent p-0 text-center shadow-none transition duration-150 hover:z-20 hover:scale-105 hover:shadow-none focus-visible:z-20 focus-visible:scale-105 ${
                    isEditingLayout ? "cursor-grab border-[var(--app-accent)] bg-white ring-2 ring-[var(--app-accent)]/20 active:cursor-grabbing" : "cursor-pointer"
                  } ${isSelected ? "ring-2 ring-[var(--app-accent)]" : ""}`}
                >
                  <span className={`flex min-h-7 min-w-7 items-center justify-center rounded-md border-2 px-1 text-[9px] font-bold shadow-sm ${statusStyle}`}>
                    {station.label}
                  </span>
                  {(assignment || reservation) && <span className="max-w-20 truncate rounded-full bg-[#202124] px-2 py-0.5 text-[8px] font-semibold leading-tight text-white">{(assignment ?? reservation)?.entry.customerName}</span>}
                  <span className={`max-w-20 truncate rounded-full px-2 py-0.5 text-[8px] font-bold leading-tight ${statusStyle}`}>{statusLabel}</span>
                  {isEditingLayout && <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-[var(--color-ink)] px-1 text-[8px] text-white">{position.x.toFixed(1)}%, {position.y.toFixed(1)}%</span>}
                </button>
              );
            })}

          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--app-ink-muted)]">
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border-2 border-emerald-700 bg-white" /> Available</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border-2 border-amber-500 bg-amber-100" /> Reserved</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border-2 border-[#202124] bg-[#202124]" /> In use</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border-2 border-[#b8b8bd] bg-[#f2f2f3]" /> Unavailable</span>
            <span className="ml-auto inline-flex items-center gap-1.5"><DoorOpen size={14} aria-hidden="true" /> Entrance</span>
          </div>
          {isEditingLayout && (
            <p className="mt-2 rounded-lg bg-[var(--app-surface-soft)] px-3 py-2 text-xs text-[var(--app-ink-muted)]">
              Drag each marker to its exact floor position. For fine adjustments, focus a marker and use arrow keys; hold Alt to move by 0.1%.
            </p>
          )}
        </div>

        <aside className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-canvas)] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--app-ink-muted)]">Stations in use</p>
            <p className="mt-1 font-display text-2xl font-semibold text-[var(--color-ink)]">{activeCount}<span className="ml-1 text-sm font-medium text-[var(--app-ink-muted)]">/ {activeStationCount}</span></p>
          </div>
          <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]"><Store size={15} aria-hidden="true" /> Map key</h3>
            <p className="mt-2 text-xs leading-5 text-[var(--app-ink-muted)]">Select any station to see its availability and who is assigned. Use <strong className="text-[var(--color-ink)]">Arrange floor plan</strong> to place markers at their actual positions.</p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--app-ink-muted)]"><MapPinned size={13} aria-hidden="true" /> Layout is saved in this browser.</p>
          </div>
          {selectedItem && (
            <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-soft)] p-3" aria-live="polite">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--app-ink-muted)]">Selected station</h3>
              {selectedStation && (
                <>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[var(--color-ink)]">{selectedStation.label}</p>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                      !selectedStation.isActive ? "bg-clay-light text-clay"
                        : activeServiceByStation.has(selectedStation.id) ? "bg-amber-100 text-amber-950"
                          : reservedServiceByStation.has(selectedStation.id) ? "bg-gold-light text-ink"
                            : "bg-success-soft text-success"
                    }`}>
                      {!selectedStation.isActive ? "Unavailable"
                        : activeServiceByStation.has(selectedStation.id) ? "In use"
                          : reservedServiceByStation.has(selectedStation.id) ? "Reserved"
                            : "Available"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--app-ink-muted)]">{selectedStation.category}</p>
                  {selectedStationService ? (
                    <dl className="mt-2 space-y-1 text-xs">
                      <div><dt className="inline font-medium text-[var(--app-ink-muted)]">Customer: </dt><dd className="inline text-[var(--color-ink)]">{selectedStationService.entry.customerName} · Ticket {formatTicketNumber(selectedStationService.entry.ticketNumber)}</dd></div>
                      <div><dt className="inline font-medium text-[var(--app-ink-muted)]">Service: </dt><dd className="inline text-[var(--color-ink)]">{selectedStationService.service.name}</dd></div>
                      <div><dt className="inline font-medium text-[var(--app-ink-muted)]">Staff: </dt><dd className="inline text-[var(--color-ink)]">{staff.find((member) => member.id === selectedStationService.service.assignedStaffId)?.fullName ?? selectedStation.homeStaffName ?? "Not assigned"}</dd></div>
                    </dl>
                  ) : (
                    <p className="mt-2 text-xs text-[var(--app-ink-muted)]">
                      {selectedStation.isActive ? "No customer is assigned to this station." : "This station is inactive and cannot be assigned."}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
          {stations.length === 0 && (
            <p className="rounded-xl border border-dashed border-[var(--app-border)] p-4 text-center text-xs text-[var(--app-ink-muted)]">Add stations to place them on your map.</p>
          )}
          <p className="flex items-center gap-1.5 text-[10px] text-[var(--app-ink-muted)]"><UserRound size={12} aria-hidden="true" /> Live data refreshes every 15 seconds.</p>
        </aside>
      </div>
    </section>
  );
}
