import { useEffect, useMemo, useState } from 'react';
import { mapServiceSeatsToLayout, SEAT_LAYOUT, type SeatArea, type SeatSpot } from './salonMapLayout';

export type { SeatArea } from './salonMapLayout';

export type SeatStatus = 'free' | 'busy' | 'reserved' | 'unavailable' | 'unconfigured';

export interface MapSeat {
  /** Must match a key in SEAT_LAYOUT: hair-1…hair-7, nail-1…nail-3, shampoo-1…shampoo-2 */
  id: string;
  resourceId?: string;
  label?: string;
  status: SeatStatus;
  manualStatus?: 'available' | 'reserved' | 'unavailable';
  queueReserved?: boolean;
  /** Customer currently using the seat */
  occupant?: string;
  /** Optional extra info shown on double-click */
  phone?: string;
  ticket?: number;
  since?: string;
  endsAt?: string;
  /** Service being done */
  service?: string;
  /** Staff member */
  staff?: string;
}

export interface ServiceSeatMapOption {
  id: string;
  label: string;
  category: string;
  status: Exclude<SeatStatus, 'unconfigured'>;
  isEligible: boolean;
  sharedWithVisit?: boolean;
}

const AREAS: { key: SeatArea | 'desk' | 'lounge'; name: string; tone: string }[] = [
  { key: 'hair', name: 'Hair area', tone: 'hair' },
  { key: 'nail', name: 'Nail area', tone: 'nail' },
  { key: 'desk', name: 'Front desk area', tone: 'desk' },
  { key: 'lounge', name: 'Customer lounge', tone: 'lounge' },
  { key: 'shampoo', name: 'Shampoo area', tone: 'shampoo' },
];

const STATUS_LABEL: Record<SeatStatus, string> = {
  free: 'Available',
  busy: 'In use',
  reserved: 'Reserved',
  unavailable: 'Unavailable',
  unconfigured: 'Not configured',
};

function AreaChip({ tone, text, x, y, vertical }: { tone: string; text: string; x: number; y: number; vertical?: boolean }) {
  const w = text.length * 17 + 36;
  return (
    <g transform={`translate(${x} ${y})${vertical ? ' rotate(-90)' : ''}`}>
      <rect className={`sm-chip sm-chip-${tone}`} x={-w / 2} y={-20} width={w} height={40} rx={20} />
      <text textAnchor="middle" dominantBaseline="central" className="sm-chip-text">
        {text}
      </text>
    </g>
  );
}

function SeatGlyph({
  spot,
  seat,
  selected,
  onSelect,
  onOpen,
  num,
  interactive = true,
  ariaLabel,
}: {
  spot: SeatSpot;
  seat: MapSeat;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  num: string;
  interactive?: boolean;
  ariaLabel?: string;
}) {
  return (
    <g
      className={`sm-seat sm-${seat.status} ${selected ? 'is-selected' : ''} ${interactive ? '' : 'sm-seat-disabled'}`}
      transform={`translate(${spot.x} ${spot.y})`}
      onClick={interactive ? onSelect : undefined}
      onDoubleClick={interactive ? onOpen : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : -1}
      aria-disabled={!interactive || undefined}
      aria-label={ariaLabel ?? `${seat.label ?? spot.label}: ${STATUS_LABEL[seat.status]}`}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter') onOpen(); else if (e.key === ' ') onSelect(); } : undefined}
    >
      <circle r={64} className="sm-seat-halo" />
      <g transform={`rotate(${spot.rot}) scale(1.05)`}>
        {/* backrest sits against the wall */}
        <rect x={-34} y={-46} width={68} height={15} rx={7.5} className="sm-back" />
        {/* seat cushion */}
        <rect x={-30} y={-27} width={60} height={58} rx={16} className="sm-cushion" />
      </g>
      <text className="sm-seat-num" textAnchor="middle" dominantBaseline="central" y={2}>
        {num}
      </text>
    </g>
  );
}

function ShampooBed({
  spot,
  seat,
  selected,
  onSelect,
  onOpen,
  num,
  interactive = true,
  ariaLabel,
}: {
  spot: SeatSpot;
  seat: MapSeat;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  num: string;
  interactive?: boolean;
  ariaLabel?: string;
}) {
  return (
    <g
      className={`sm-seat sm-${seat.status} ${selected ? 'is-selected' : ''} ${interactive ? '' : 'sm-seat-disabled'}`}
      transform={`translate(${spot.x} ${spot.y})`}
      onClick={interactive ? onSelect : undefined}
      onDoubleClick={interactive ? onOpen : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : -1}
      aria-disabled={!interactive || undefined}
      aria-label={ariaLabel ?? `${seat.label ?? spot.label}: ${STATUS_LABEL[seat.status]}`}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter') onOpen(); else if (e.key === ' ') onSelect(); } : undefined}
    >
      <rect x={-70} y={-52} width={140} height={104} rx={18} className="sm-seat-halo" />
      <rect x={-62} y={-44} width={124} height={88} rx={14} className="sm-bed-frame" />
      <rect x={-52} y={-34} width={104} height={68} rx={10} className="sm-bed-body" />
      <rect x={-52} y={-34} width={30} height={68} rx={10} className="sm-bed-pillow" />
      <text className="sm-seat-num" textAnchor="middle" dominantBaseline="central" y={2}>
        {num}
      </text>
    </g>
  );
}

function SalonFixtures() {
  const stylingMirrorPositions = [
    [303, 815],
    [393, 719],
    [483, 622],
    [568, 531],
    [646, 447],
  ];

  return (
    <g aria-label="Salon workstations and furnishings">
      {stylingMirrorPositions.map(([x, y]) => (
        <g key={`${x}-${y}`} className="sm-mirror" transform={`translate(${x} ${y}) rotate(-47)`}>
          <title>Hair styling mirror</title>
          <rect x={-34} y={-13} width={68} height={26} rx={4} />
          <line x1={-25} y1={0} x2={25} y2={0} />
        </g>
      ))}
      {[770, 930].map((y) => (
        <g key={y} className="sm-mirror" transform={`translate(887 ${y})`}>
          <title>Hair styling mirror mounted on wall</title>
          <rect x={-9} y={-35} width={18} height={70} rx={4} />
          <line x1={0} y1={-28} x2={0} y2={28} />
        </g>
      ))}
      {[691, 846, 985].map((y) => (
        <g key={y} className="sm-worktable" transform={`translate(1200 ${y})`}>
          <title>Nail workstation table</title>
          <rect x={-18} y={-34} width={36} height={68} rx={5} />
          <line x1={-10} y1={-22} x2={10} y2={-22} />
          <circle cx={0} cy={18} r={5} />
        </g>
      ))}
      {[235, 360].map((y) => (
        <g key={y} className="sm-basin" transform={`translate(1454 ${y})`}>
          <title>Shampoo basin</title>
          <ellipse rx={25} ry={19} />
          <ellipse className="sm-basin-inner" rx={13} ry={8} />
          <circle className="sm-basin-drain" cy={2} r={2.5} />
        </g>
      ))}
    </g>
  );
}

export function ServiceSeatMapPicker({
  seats,
  selectedSeatId,
  onSelect,
  disabled = false,
}: {
  seats: ServiceSeatMapOption[];
  selectedSeatId: string;
  onSelect: (seatId: string) => void;
  disabled?: boolean;
}) {
  const seatsByLayout = mapServiceSeatsToLayout(seats);
  const selectableSeats = seats.filter((seat) =>
    seat.isEligible && (seat.status === 'free' || seat.sharedWithVisit)
  );
  const selectedSeat = seats.find((seat) => seat.id === selectedSeatId);

  return (
    <div className="sm-seat-picker">
      <style>{SALON_MAP_CSS}</style>
      <svg viewBox="150 110 1400 1170" role="group" aria-label="Select an available service chair from the salon map" className="sm-svg">
        <polygon className="sm-floor" points="195,930 690,400 1095,290 1220,150 1490,153 1495,540 1333,533 1335,1185 203,1165" />
        <polygon className="sm-zone sm-zone-hair" points="195,930 690,400 890,606 890,1000 335,1000 335,960 195,960" />
        <polygon className="sm-zone sm-zone-lounge" points="195,960 335,960 335,1005 1075,1005 1075,1190 195,1190" />
        <rect className="sm-zone sm-zone-nail" x={1165} y={545} width={170} height={515} />
        <rect className="sm-zone sm-zone-desk" x={895} y={430} width={240} height={275} />
        <rect className="sm-zone sm-zone-shampoo" x={1290} y={150} width={210} height={390} />
        <polygon className="sm-wall" points="195,930 690,400 1095,290 1220,150 1490,153 1495,540 1333,533 1335,1185 1190,1183 1100,1181 203,1165" fill="none" />
        <rect className="sm-wall-solid" x={880} y={700} width={14} height={30} rx={3} />
        <rect className="sm-wall-solid" x={880} y={810} width={14} height={80} rx={3} />
        <rect className="sm-wall-solid" x={880} y={970} width={14} height={35} rx={3} />
        <SalonFixtures />
        <g className="sm-lounge-seats" aria-label="Customer lounge seating area">
          <rect x={220} y={975} width={86} height={118} rx={14} />
          <rect x={345} y={1070} width={150} height={80} rx={14} />
          <rect x={550} y={1070} width={150} height={80} rx={14} />
          <rect x={895} y={1070} width={150} height={80} rx={14} />
        </g>
        <AreaChip tone="hair" text="HAIR AREA" x={570} y={965} />
        <AreaChip tone="nail" text="NAIL AREA" x={1250} y={610} />
        <AreaChip tone="shampoo" text="SHAMPOO" x={1395} y={485} />
        <AreaChip tone="desk" text="FRONT DESK" x={1015} y={485} />
        <AreaChip tone="lounge" text="CUSTOMER LOUNGE" x={625} y={1036} />
        {Object.entries(SEAT_LAYOUT).map(([layoutId, spot]) => {
          const option = seatsByLayout.get(layoutId);
          const seat: MapSeat = {
            id: layoutId,
            label: option?.label ?? spot.label,
            status: option
              ? option.isEligible || option.status !== 'free'
                ? option.status
                : 'unconfigured'
              : 'unconfigured',
          };
          const interactive = Boolean(option?.isEligible
            && (option.status === 'free' || option.sharedWithVisit)
            && !disabled);
          const ariaLabel = option
            ? `${option.label}: ${option.sharedWithVisit ? 'already assigned to this visit' : option.isEligible ? STATUS_LABEL[option.status] : 'not compatible with this service'}`
            : `${spot.label}: Not configured`;
          const select = () => {
            if (interactive && option) onSelect(option.id);
          };
          const props = {
            key: layoutId,
            spot,
            seat,
            num: layoutId.split('-')[1],
            selected: option?.id === selectedSeatId,
            onSelect: select,
            onOpen: select,
            interactive,
            ariaLabel,
          };
          return spot.area === 'shampoo'
            ? <ShampooBed {...props} />
            : <SeatGlyph {...props} />;
        })}
      </svg>
      <div className="sm-legend" aria-label="Map legend">
        <span><i className="sm-dot sm-dot-free" /> Available (compatible chairs selectable)</span>
        <span><i className="sm-dot sm-dot-reserved" /> Reserved for this visit (shareable)</span>
        <span><i className="sm-dot sm-dot-busy" /> In use</span>
        <span><i className="sm-dot sm-dot-reserved" /> Reserved</span>
        <span><i className="sm-dot sm-dot-unconfigured" /> Not configured</span>
        <span><i className="sm-dot sm-dot-unconfigured" /> Not compatible with this service</span>
      </div>
      {selectableSeats.length > 0 && (
        <div className="mt-2 flex flex-wrap justify-center gap-2" aria-label="Choose an available service chair">
          {selectableSeats.map((seat) => (
            <button
              key={seat.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(seat.id)}
              aria-pressed={selectedSeatId === seat.id}
              className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
                selectedSeatId === seat.id
                  ? 'border-sage-deep bg-sage-light text-sage-deep'
                  : 'border-mist bg-white text-ink/70 hover:border-sage'
              }`}
            >
              {seat.label}{seat.sharedWithVisit ? ' · Same visit' : ''}
            </button>
          ))}
        </div>
      )}
      {Object.keys(SEAT_LAYOUT).some((layoutId) => !seatsByLayout.has(layoutId)) && (
        <p className="sm-hint">Chairs marked “Not configured” must be added and activated in the Salon Map before they can be selected.</p>
      )}
      {selectedSeat && <p className="sm-hint" aria-live="polite">Selected: {selectedSeat.label}</p>}
    </div>
  );
}

const DEMO_SEATS: MapSeat[] = [
  { id: 'hair-7', status: 'busy', occupant: 'Mika R.', service: 'Haircut (Women)', staff: 'Joy', ticket: 19, phone: '09171234567', since: '2:10 PM', endsAt: '3:00 PM' },
  { id: 'hair-6', status: 'free' },
  { id: 'hair-5', status: 'reserved', occupant: 'Ana L.', service: 'Hair color', ticket: 21, phone: '09175557788', since: '3:00 PM' },
  { id: 'hair-4', status: 'free' },
  { id: 'hair-3', status: 'free' },
  { id: 'hair-2', status: 'busy', occupant: 'Leo P.', service: 'Haircut Mens', staff: 'Ben', ticket: 17, phone: '09184445566', since: '2:25 PM', endsAt: '2:55 PM' },
  { id: 'hair-1', status: 'free' },
  { id: 'nail-1', status: 'busy', occupant: 'Hary', service: 'Manicure (Regular)', staff: 'Cris', ticket: 18, phone: '09165463567', since: '2:30 PM', endsAt: '3:15 PM' },
  { id: 'nail-2', status: 'free' },
  { id: 'nail-3', status: 'free' },
  { id: 'shampoo-1', status: 'free' },
  { id: 'shampoo-2', status: 'free' },
];

const SALON_MAP_CSS = `
.lq, .sm-wrap {
  --ink: #1d1d1f;
  --muted: #6e6e73;
  --line: #e6e6e8;
  --soft: #f6f6f7;
  --card: #fff;
  --ok: #2f7a4d;
  --ok-bg: #e7f4ec;
  --warn: #9a6b00;
  --warn-bg: #fbf0d4;
  --info: #1f5fa8;
  --info-bg: #e5effa;
  --bad: #b3261e;
  --bad-bg: #fbe9e7;
  color: var(--ink);
}
.sm-wrap { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 20px; align-items: start; }
.sm-canvas { border: 1px solid var(--line); border-radius: 16px; background: #fff; padding: 12px; }
.sm-svg { width: 100%; height: auto; display: block; }
.sm-floor { fill: #fbfbfb; }
.sm-wall { stroke: var(--ink); stroke-width: 9; stroke-linejoin: round; }
.sm-wall-solid { fill: var(--ink); }
.sm-zone { opacity: .75; }
.sm-zone-hair { fill: #ece8f7; }
.sm-zone-nail { fill: #fbe8ef; }
.sm-zone-desk { fill: #f3ecd9; }
.sm-zone-shampoo { fill: #e2eff9; }
.sm-zone-lounge { fill: #eaf3ea; }
.sm-desk-wall { fill: var(--ink); }
.sm-desk { fill: #fff; stroke: #8a8a90; stroke-width: 3; }
.sm-desk-div { stroke: #c9c9ce; stroke-width: 3; }
.sm-lounge { fill: #3f3f46; stroke: #18181b; stroke-width: 3; }
.sm-lounge-seats rect { fill: #3f3f46; stroke: #18181b; stroke-width: 3; }
.sm-door { fill: none; stroke: #8a8a90; stroke-width: 3; stroke-dasharray: 8 6; }
.sm-door-gap { stroke: #fbfbfb; stroke-width: 12; }
.sm-tiny { font-weight: 600; font-size: 26px; fill: var(--muted); }
.sm-bed-frame { fill: #fff; stroke: #8a8a90; stroke-width: 3; }
.sm-bed-body { fill: #dbe9f5; }
.sm-bed-pillow { fill: #b9d3ea; }
.sm-chip-text { font-weight: 700; font-size: 25px; letter-spacing: .08em; fill: var(--ink); }
.sm-chip-text.sm-chip-sm { font-size: 21px; letter-spacing: .04em; }
.sm-chip { stroke: var(--ink); stroke-width: 2; }
.sm-chip-hair { fill: #ece8f7; }
.sm-chip-nail { fill: #fbe8ef; }
.sm-chip-desk { fill: #f3ecd9; }
.sm-chip-shampoo { fill: #e2eff9; }
.sm-chip-lounge { fill: #eaf3ea; }
.sm-seat { cursor: pointer; outline: none; }
.sm-seat-disabled { cursor: default; }
.sm-seat-halo { fill: transparent; stroke: transparent; stroke-width: 5; }
.sm-seat.is-selected .sm-seat-halo, .sm-seat:focus-visible .sm-seat-halo { stroke: var(--ink); fill: rgba(0,0,0,.05); }
.sm-seat:hover .sm-seat-halo { fill: rgba(0,0,0,.06); }
.sm-seat-num { font-weight: 700; font-size: 34px; pointer-events: none; }
.sm-cushion, .sm-back { stroke-width: 3.5; }
.sm-free .sm-cushion { fill: #374151; stroke: #1f2937; }
.sm-free .sm-back { fill: #1f2937; stroke: #111827; }
.sm-free .sm-seat-num { fill: #fff; }
.sm-free .sm-bed-body { fill: #374151; stroke: #1f2937; }
.sm-free .sm-bed-pillow { fill: #1f2937; }
.sm-busy .sm-cushion { fill: #18181b; stroke: #09090b; }
.sm-busy .sm-back { fill: #09090b; stroke: #000; }
.sm-busy .sm-seat-num { fill: #fff; }
.sm-busy .sm-bed-body { fill: #18181b; stroke: #09090b; }
.sm-busy .sm-bed-pillow { fill: #09090b; }
.sm-reserved .sm-cushion { fill: #1e3a5f; stroke: #0f2742; }
.sm-reserved .sm-back { fill: #0f2742; stroke: #0b1c30; }
.sm-reserved .sm-seat-num { fill: #fff; }
.sm-reserved .sm-bed-body { fill: #1e3a5f; stroke: #0f2742; }
.sm-reserved .sm-bed-pillow { fill: #0f2742; }
.sm-legend { display: flex; gap: 18px; justify-content: center; padding: 10px 0 2px; font-size: .85rem; color: var(--muted); }
.sm-dot { display: inline-block; width: 12px; height: 12px; border-radius: 4px; margin-right: 6px; vertical-align: -1px; border: 2px solid; }
.sm-dot-free { background: #374151; border-color: #1f2937; }
.sm-dot-busy { background: #18181b; border-color: #09090b; }
.sm-dot-reserved { background: #1e3a5f; border-color: #0f2742; }
.sm-side { border: 1px solid var(--line); border-radius: 16px; background: #fff; padding: 18px; }
.sm-side-title { margin: 0 0 10px; font-size: .75rem; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
.sm-side-title:not(:first-child) { margin-top: 22px; }
.sm-areas { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.sm-area { display: grid; padding: 10px 12px; border-radius: 10px; border-left: 5px solid; }
.sm-area-name { font-weight: 600; }
.sm-area-note { color: var(--muted); font-size: .83rem; }
.sm-area-hair { background: #f5f3fb; border-color: #b5a7e0; }
.sm-area-nail { background: #fdf3f7; border-color: #eba3bd; }
.sm-area-desk { background: #faf6ea; border-color: #d3bd7c; }
.sm-area-shampoo { background: #f1f7fc; border-color: #8fbbe0; }
.sm-area-lounge { background: #f3f9f3; border-color: #9fcaa2; }
.sm-muted { color: var(--muted); font-size: .88rem; margin: 0; }
.sm-detail { border: 1px solid var(--line); border-radius: 12px; padding: 12px; }
.sm-detail-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
.sm-detail dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: .88rem; }
.sm-detail dt { color: var(--muted); }
.sm-detail dd { margin: 0; font-weight: 600; }
.sm-badge { font-size: .72rem; font-weight: 600; padding: 3px 10px; border-radius: 999px; }
.sm-badge-free { background: var(--ok-bg); color: var(--ok); }
.sm-badge-busy { background: var(--ink); color: #fff; }
.sm-badge-reserved { background: var(--warn-bg); color: var(--warn); }
@media (max-width: 960px) { .sm-wrap { grid-template-columns: 1fr; } }
.sm-canvas { padding: 20px 24px 14px; }
.sm-wrap { gap: 28px; }
.sm-areas { gap: 10px; }
.sm-tag rect { fill: var(--ink); }
.sm-tag text { fill: #fff; font-weight: 600; font-size: 26px; }
.sm-reserved .sm-tag rect { fill: #c58a00; }
.sm-canvas { padding: 36px 36px 20px; }
.sm-wrap { grid-template-columns: minmax(0, 1fr) 320px; gap: 32px; }
.sm-side { padding: 22px; }
.sm-side-title:not(:first-child) { margin-top: 28px; }
.sm-track { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.sm-track-row { width: 100%; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: #fff; font: inherit; font-size: .88rem; cursor: pointer; text-align: left; }
.sm-track-row:hover { background: var(--soft); }
.sm-track-row.is-selected { border-color: var(--ink); box-shadow: 0 0 0 1px var(--ink); }
.sm-track-who { font-weight: 600; }
.sm-track .sm-dot { margin: 0; }
.sm-wrap { grid-template-columns: 1fr; gap: 24px; }
.sm-canvas { padding: clamp(12px, 2vw, 24px); }
.sm-svg { max-width: 900px; max-height: 64vh; margin: 0 auto; object-fit: contain; }
.sm-side { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 32px; padding: 24px; }
.sm-col .sm-side-title { margin: 0 0 12px !important; }
.sm-tag text { font-size: 22px; }
.sm-chip-text { font-size: 22px; }
.sm-chip-text.sm-chip-sm { font-size: 19px; }
.sm-seat-num { font-size: 30px; }
.sm-zone { opacity: .55; }
.sm-chip { stroke-width: 1.5; }
@media (max-width: 960px) { .sm-side { grid-template-columns: 1fr; } }
.sm-free .sm-tag rect { fill: #fff; stroke: var(--ok); stroke-width: 2.5; }
.sm-free .sm-tag text { fill: var(--ok); }
.sm-hint { text-align: center; color: var(--muted); font-size: .8rem; margin: 6px 0 0; }
.sm-modal-back { position: fixed; inset: 0; background: rgba(20,20,22,.45); display: grid; place-items: center; z-index: 50; padding: 20px; }
.sm-modal { background: #fff; border-radius: 18px; padding: 24px; width: min(460px, 100%); box-shadow: 0 20px 60px rgba(0,0,0,.25); }
.sm-modal-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; }
.sm-modal-head h3 { margin: 0 0 8px; font-size: 1.3rem; }
.sm-modal-x { border: 0; background: var(--soft); width: 34px; height: 34px; border-radius: 10px; font-size: 1.3rem; cursor: pointer; line-height: 1; }
.sm-modal-x:hover { background: #e8e8ea; }
.sm-modal-grid { margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 14px 20px; }
.sm-modal-grid dt { color: var(--muted); font-size: .78rem; text-transform: uppercase; letter-spacing: .06em; }
.sm-modal-grid dd { margin: 3px 0 0; font-weight: 600; }
.sm-svg { user-select: none; -webkit-user-select: none; }
.sm-zone { opacity: .95; }
.sm-zone-hair { fill: #e4dcf6; }
.sm-zone-nail { fill: #f9d8e4; }
.sm-zone-desk { fill: #f2e2b8; }
.sm-zone-shampoo { fill: #cfe4f6; }
.sm-zone-lounge { fill: #d3ecd5; }
.sm-chip-hair { fill: #e4dcf6; }
.sm-chip-nail { fill: #f9d8e4; }
.sm-chip-desk { fill: #f2e2b8; }
.sm-chip-shampoo { fill: #cfe4f6; }
.sm-chip-lounge { fill: #d3ecd5; }
.sm-legend-areas { flex-wrap: wrap; padding-top: 4px; }
.sm-sw { display: inline-block; width: 14px; height: 14px; border-radius: 4px; margin-right: 6px; vertical-align: -2px; border: 1.5px solid rgba(0,0,0,.35); }
.sm-sw-hair { background: #e4dcf6; }
.sm-sw-nail { background: #f9d8e4; }
.sm-sw-desk { background: #f2e2b8; }
.sm-sw-shampoo { background: #cfe4f6; }
.sm-sw-lounge { background: #d3ecd5; }
.sm-chip-text, .sm-chip-text.sm-chip-sm { font-size: 28px; letter-spacing: .06em; }
.sm-wrap { gap: clamp(16px, 2.5vw, 32px); }
.sm-canvas { border-color: #e4e0eb; background: linear-gradient(155deg, #fff 0%, #fbfaff 100%); box-shadow: 0 12px 30px rgba(44, 35, 67, .08); }
.sm-floor { fill: #fdfcff; }
.sm-seat { transition: opacity .16s ease; }
.sm-seat:hover { opacity: .84; }
.sm-unconfigured .sm-cushion,
.sm-unconfigured .sm-back { fill: #52525b; stroke: #a1a1aa; stroke-dasharray: 6 5; }
.sm-unconfigured .sm-bed-body { fill: #52525b; stroke: #a1a1aa; stroke-dasharray: 6 5; }
.sm-unconfigured .sm-seat-num { fill: #fff; }
.sm-dot-unconfigured { background: #52525b; border-color: #a1a1aa; }
.sm-badge-unconfigured { background: #52525b; color: #fff; }
.sm-unavailable .sm-cushion, .sm-unavailable .sm-bed-body { fill: #52525b; stroke: #3f3f46; }
.sm-unavailable .sm-back, .sm-unavailable .sm-bed-pillow { fill: #3f3f46; stroke: #27272a; }
.sm-unavailable .sm-seat-num { fill: #fff; }
.sm-dot-unavailable { background: #52525b; border-color: #3f3f46; }
.sm-badge-unavailable { background: #52525b; color: #fff; }
.sm-mirror rect { fill: #dbeafe; stroke: #475569; stroke-width: 3; }
.sm-mirror line { stroke: #fff; stroke-width: 2; }
.sm-worktable rect { fill: #d6d3d1; stroke: #57534e; stroke-width: 3; }
.sm-worktable line { stroke: #78716c; stroke-width: 2; }
.sm-worktable circle { fill: #44403c; }
.sm-basin ellipse { fill: #dbeafe; stroke: #475569; stroke-width: 3; }
.sm-basin .sm-basin-inner { fill: #93c5fd; stroke: #475569; stroke-width: 2; }
.sm-basin .sm-basin-drain { fill: #334155; }
.sm-fixture-key { display: inline-block; width: 14px; height: 14px; margin-right: 6px; vertical-align: -2px; border: 2px solid #475569; border-radius: 3px; background: #dbeafe; }
.sm-fixture-key-table { border-color: #57534e; background: #d6d3d1; }
.sm-area-note { line-height: 1.45; }
.sm-seat-picker { width: 100%; min-width: 0; }
.sm-seat-picker .sm-svg { width: 100%; max-width: 520px; max-height: 40dvh; margin: 0 auto; object-fit: contain; }
.sm-seat-picker .sm-legend { width: 100%; min-width: 0; flex-wrap: wrap; align-items: flex-start; gap: 8px 14px; }
.sm-seat-picker .sm-legend span { display: inline-flex; flex: 1 1 150px; min-width: 0; align-items: flex-start; }
.sm-seat-picker .sm-dot { flex: 0 0 12px; margin-top: 3px; }
.sm-unconfigured .sm-cushion,
.sm-unconfigured .sm-back { fill: #71717a; stroke: #3f3f46; stroke-dasharray: none; }
.sm-unconfigured .sm-seat-num { fill: #fff; }
`;

export default function SalonMap({
  seats = DEMO_SEATS,
  onSetStatus,
}: {
  seats?: MapSeat[];
  onSetStatus?: (seatId: string, status: 'available' | 'reserved' | 'unavailable') => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    if (!openId) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && setOpenId(null);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [openId]);

  const byId = useMemo(() => new Map(seats.map((s) => [s.id, s])), [seats]);
  const seatFor = (id: string): MapSeat => byId.get(id) ?? { id, status: 'unconfigured' };

  const stats = (area: SeatArea) => {
    const ids = Object.keys(SEAT_LAYOUT).filter((id) => SEAT_LAYOUT[id].area === area);
      const busy = ids.filter((id) => seatFor(id).status === 'busy').length;
    const free = ids.filter((id) => seatFor(id).status === 'free').length;
    const reserved = ids.filter((id) => seatFor(id).status === 'reserved').length;
    const unavailable = ids.filter((id) => seatFor(id).status === 'unavailable').length;
    const unconfigured = ids.filter((id) => seatFor(id).status === 'unconfigured').length;
    return { busy, free, reserved, unavailable, unconfigured };
  };

  const selected = selectedId ? SEAT_LAYOUT[selectedId] : null;
  const selectedSeat = selectedId ? seatFor(selectedId) : null;

  return (
    <>
    <style>{SALON_MAP_CSS}</style>
    <div className="sm-wrap">
      <div className="sm-canvas">
        <svg viewBox="150 110 1400 1170" role="img" aria-label="Salon floor plan" className="sm-svg">
          <defs>
            <clipPath id="sm-floor">
              <polygon points="195,930 690,400 1095,290 1220,150 1490,153 1495,540 1333,533 1335,1185 203,1165" />
            </clipPath>
          </defs>

          {/* Floor + area tints */}
          <polygon
            className="sm-floor"
            points="195,930 690,400 1095,290 1220,150 1490,153 1495,540 1333,533 1335,1185 203,1165"
          />
          <g clipPath="url(#sm-floor)">
            <polygon className="sm-zone sm-zone-hair" points="195,930 690,400 890,606 890,1000 335,1000 335,960 195,960" />
            <polygon className="sm-zone sm-zone-lounge" points="195,960 335,960 335,1005 1075,1005 1075,1190 195,1190" />
            <rect className="sm-zone sm-zone-nail" x={1165} y={545} width={170} height={515} />
            <rect className="sm-zone sm-zone-desk" x={895} y={430} width={240} height={275} />
            <rect className="sm-zone sm-zone-shampoo" x={1290} y={150} width={210} height={390} />
          </g>

          {/* Outer walls */}
          <polygon
            className="sm-wall"
            points="195,930 690,400 1095,290 1220,150 1490,153 1495,540 1333,533 1335,1185 1190,1183 1100,1181 203,1165"
            fill="none"
          />
          {/* Wall behind the two make-up / face hair chairs */}
          <rect className="sm-wall-solid" x={880} y={700} width={14} height={30} rx={3} />
          <rect className="sm-wall-solid" x={880} y={810} width={14} height={80} rx={3} />
          <rect className="sm-wall-solid" x={880} y={970} width={14} height={35} rx={3} />

          {/* Front desk */}
          <g transform="translate(1015 582) scale(0.78) translate(-1015 -560)">
            <rect className="sm-desk-wall" x={890} y={520} width={250} height={26} rx={4} />
            <rect className="sm-desk" x={905} y={572} width={220} height={93} rx={10} />
            <line className="sm-desk-div" x1={1015} y1={578} x2={1015} y2={660} />
          </g>

          <g className="sm-lounge-seats">
            <rect x={220} y={975} width={86} height={118} rx={14} />
            <rect x={345} y={1070} width={150} height={80} rx={14} />
            <rect x={550} y={1070} width={150} height={80} rx={14} />
            <rect x={895} y={1070} width={150} height={80} rx={14} />
          </g>

          {/* Entrance */}
          <line className="sm-door-gap" x1={1103} y1={1181} x2={1188} y2={1183} />
          <path className="sm-door" d="M1100 1181 L1100 1096 A85 85 0 0 1 1185 1182" />
          <text className="sm-tiny" x={1145} y={1220} textAnchor="middle">
            Entrance
          </text>

          <SalonFixtures />

          {/* Shampoo beds (display only) */}
          {/* Area labels */}
          <g className="sm-chips">
            <AreaChip tone="hair" text="HAIR AREA" x={570} y={965} />
            <AreaChip tone="nail" text="NAIL AREA" x={1250} y={610} />
            <AreaChip tone="shampoo" text="SHAMPOO AREA" x={1395} y={485} />
            <AreaChip tone="desk" text="FRONT DESK" x={1015} y={485} />
            <AreaChip tone="lounge" text="CUSTOMER LOUNGE" x={625} y={1036} />
          </g>

          {/* Seats */}
          {Object.entries(SEAT_LAYOUT)
            .map(([id, spot]) => {
              const seat = seatFor(id);
              const props = {
                key: id,
                spot,
                seat,
                num: id.split('-')[1],
                selected: selectedId === id,
                onSelect: () => setSelectedId(id),
                onOpen: () => { setSelectedId(id); setOpenId(id); },
              };
              return spot.area === 'shampoo'
                ? <ShampooBed {...props} />
                : <SeatGlyph {...props} />;
            })}
        </svg>

        <div className="sm-legend" aria-label="Legend">
          <span><i className="sm-dot sm-dot-free" /> Free</span>
          <span><i className="sm-dot sm-dot-busy" /> In use</span>
          <span><i className="sm-dot sm-dot-reserved" /> Reserved</span>
          <span><i className="sm-dot sm-dot-unavailable" /> Unavailable</span>
          <span><i className="sm-dot sm-dot-unconfigured" /> Not configured</span>
        </div>
        <div className="sm-legend sm-legend-areas" aria-label="Area colours">
          <span><i className="sm-sw sm-sw-hair" /> Hair area</span>
          <span><i className="sm-sw sm-sw-nail" /> Nail area</span>
          <span><i className="sm-sw sm-sw-desk" /> Front desk</span>
          <span><i className="sm-sw sm-sw-shampoo" /> Shampoo area</span>
          <span><i className="sm-sw sm-sw-lounge" /> Customer lounge</span>
        </div>
        <div className="sm-legend sm-legend-areas" aria-label="Salon fixtures">
          <span><i className="sm-fixture-key" /> Styling mirrors</span>
          <span><i className="sm-fixture-key sm-fixture-key-table" /> Nail tables</span>
          <span><i className="sm-fixture-key" /> Shampoo basins</span>
        </div>
        <p className="sm-hint">Click a seat to select it · double-click for full details</p>
      </div>

      <aside className="sm-side">
        <div className="sm-col"><h3 className="sm-side-title">Areas</h3>
        <ul className="sm-areas">
          {AREAS.map((a) => {
            if (a.key === 'desk')
              return (
                <li key={a.key} className={`sm-area sm-area-${a.tone}`}>
                  <span className="sm-area-name">{a.name}</span>
                  <span className="sm-area-note">Reception &amp; check-in</span>
                </li>
              );
            if (a.key === 'lounge')
              return (
                <li key={a.key} className={`sm-area sm-area-${a.tone}`}>
                  <span className="sm-area-name">{a.name}</span>
                  <span className="sm-area-note">Waiting area</span>
                </li>
              );
            const s = stats(a.key);
            return (
              <li key={a.key} className={`sm-area sm-area-${a.tone}`}>
                <span className="sm-area-name">{a.name}</span>
                <span className="sm-area-note">
                  {s.busy} in use · {s.free} available{s.reserved ? ` · ${s.reserved} reserved` : ''}{s.unavailable ? ` · ${s.unavailable} unavailable` : ''}{s.unconfigured ? ` · ${s.unconfigured} not configured` : ''}
                </span>
              </li>
            );
          })}
        </ul></div>
<div className="sm-col"><h3 className="sm-side-title">Who is where</h3>
        <ul className="sm-track">
          {Object.entries(SEAT_LAYOUT)
            .filter(([id]) => seatFor(id).status !== 'free')
            .map(([id, spot]) => {
              const st = seatFor(id);
              return (
                <li key={id}>
                  <button
                    className={`sm-track-row ${selectedId === id ? 'is-selected' : ''}`}
                    onClick={() => setSelectedId(selectedId === id ? null : id)}
                  >
                    <i className={`sm-dot sm-dot-${st.status}`} />
                    <span className="sm-track-seat">{st.label ?? spot.label}</span>
                    <span className="sm-track-who">{st.occupant ?? '—'}</span>
                  </button>
                </li>
              );
            })}
          {Object.keys(SEAT_LAYOUT).every((id) => ['free', 'unconfigured'].includes(seatFor(id).status)) && (
            <li className="sm-muted">No configured seats are in use.</li>
          )}
        </ul></div>
<div className="sm-col"><h3 className="sm-side-title">Selected seat</h3>
        {selected && selectedSeat ? (
          <div className="sm-detail">
            <div className="sm-detail-head">
              <strong>{selectedSeat.label ?? selected.label}</strong>
              <span className={`sm-badge sm-badge-${selectedSeat.status}`}>{STATUS_LABEL[selectedSeat.status]}</span>
            </div>
            {selectedSeat.status === 'free' ? (
              <p className="sm-muted">Nobody is using this seat right now.</p>
            ) : selectedSeat.manualStatus === 'reserved' && !selectedSeat.queueReserved ? (
              <p className="sm-muted">This seat is being held manually and will not be assigned to a new queue service.</p>
            ) : selectedSeat.queueReserved ? (
              <p className="sm-muted">This seat is reserved for an active queue service.</p>
            ) : selectedSeat.status === 'unavailable' ? (
              <p className="sm-muted">This seat is marked unavailable and cannot be assigned.</p>
            ) : selectedSeat.status === 'unconfigured' ? (
              <p className="sm-muted">This position is shown on the floor plan, but no active service seat is configured for it yet.</p>
            ) : (
              <dl>
                <dt>Customer</dt>
                <dd>{selectedSeat.occupant ?? '—'}</dd>
                <dt>Service</dt>
                <dd>{selectedSeat.service ?? '—'}</dd>
                <dt>Staff</dt>
                <dd>{selectedSeat.staff ?? '—'}</dd>
              </dl>
            )}
            {onSetStatus && selectedSeat.resourceId && selectedSeat.status !== 'unconfigured' && (
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-semibold text-ink/65">Set manual seat status</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    ['available', 'Available'],
                    ['reserved', 'Reserved'],
                    ['unavailable', 'Unavailable'],
                  ] as const).map(([status, label]) => (
                    <button
                      key={status}
                      type="button"
                      disabled={selectedSeat.status === 'busy' || selectedSeat.queueReserved || selectedSeat.manualStatus === status}
                      aria-pressed={selectedSeat.manualStatus === status}
                      onClick={() => onSetStatus(selectedSeat.resourceId!, status)}
                      className={`min-h-9 rounded-md border px-1.5 text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-45 ${
                        selectedSeat.manualStatus === status
                          ? 'border-neutral-900 bg-neutral-900 text-white'
                          : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {(selectedSeat.status === 'busy' || selectedSeat.queueReserved) && (
                  <p className="mt-1.5 text-[10px] text-ink/50">Release the active queue assignment before changing this seat.</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="sm-muted">Tap a seat on the map to see who is using it.</p>
        )}</div>
</aside>
      {openId && (() => {
        const spot = SEAT_LAYOUT[openId];
        const st = seatFor(openId);
        const rows: [string, string | undefined][] = [
          ['Area', spot.area === 'hair' ? 'Hair area' : spot.area === 'nail' ? 'Nail area' : 'Shampoo area'],
          ['Customer', st.occupant],
          ['Ticket', st.ticket ? `#${st.ticket}` : undefined],
          ['Phone', st.phone],
          ['Service', st.service],
          ['Stylist / technician', st.staff],
          ['Started', st.since],
          ['Expected finish', st.endsAt],
        ];
        return (
          <div className="sm-modal-back" onClick={() => setOpenId(null)}>
            <div className="sm-modal" role="dialog" aria-modal="true" aria-label={st.label ?? spot.label} onClick={(e) => e.stopPropagation()}>
              <div className="sm-modal-head">
                <div>
                  <h3>{st.label ?? spot.label}</h3>
                  <span className={`sm-badge sm-badge-${st.status}`}>{STATUS_LABEL[st.status]}</span>
                </div>
                <button className="sm-modal-x" onClick={() => setOpenId(null)} aria-label="Close">×</button>
              </div>
              {st.status === 'free' ? (
                <p className="sm-muted">Nobody is using this seat. It is ready for the next customer.</p>
              ) : st.status === 'unavailable' ? (
                <p className="sm-muted">This seat is marked unavailable and cannot be assigned.</p>
              ) : st.status === 'unconfigured' ? (
                <p className="sm-muted">This position is shown on the floor plan, but no active service seat is configured for it yet.</p>
              ) : (
                <dl className="sm-modal-grid">
                  {rows.map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v ?? '—'}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </div>
        );
      })()}
    </div>
    </>
  );
}