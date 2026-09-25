import { useMemo, useState } from "react";
import { computeConflicts } from "../../../logic/conflicts";
import type { Field, FieldOverlap, Permit } from "../../../types";
import { PermitCalendar } from "../PermitCalendar";
import { formatDays, formatTimeRange } from "../calendarModel";
import "./CalendarDemoPage.css";

/**
 * Development-only harness for PermitCalendar (route #/dev/calendar, registered only when
 * import.meta.env.DEV is true). Holds mock data in memory and plays the role Phase 2's app
 * state will: recomputes conflicts with src/logic/conflicts.ts and applies onPermitChange.
 */

const field = (id: string, name: string, field_type: string): Field => ({
  id, owner_id: "demo", name, field_type, geometry: { type: "Polygon", coordinates: [] }, notes: "", created_at: "", updated_at: "",
});

const FIELDS: Field[] = [
  field("f-main", "Field 1", "Soccer"),
  field("f-north", "Field 1 North Half", "Soccer"),
  field("f-diamond", "Diamond A", "Baseball"),
  field("f-far", "Field 5", "Football"),
];

/** Field 1 physically overlaps its north half and the Diamond A outfield; Field 5 is elsewhere. */
const OVERLAPS: Pick<FieldOverlap, "field_a" | "field_b">[] = [
  { field_a: "f-main", field_b: "f-north" },
  { field_a: "f-diamond", field_b: "f-main" },
];

let nextId = 1;
const permit = (organization: string, field_id: string | null, days: number[], start_time: string, end_time: string, notes = ""): Permit => ({
  id: `p${nextId++}`, owner_id: "demo", version_id: "v-demo", organization, field_id, raw_field_name: "", start_time, end_time, days, notes, extra: {}, import_batch_id: null, created_at: "", updated_at: "",
});

function initialPermits(): Permit[] {
  nextId = 1;
  return [
    // Multi-day permits on the selected field.
    permit("Kailua Youth Soccer", "f-main", [2, 4], "17:00:00", "18:30:00", "U10 and U12 practice"),
    permit("Windward FC", "f-main", [2, 4], "17:30:00", "19:00:00"), // conflicts Tue/Thu with Kailua Youth Soccer
    permit("Lanikai Lacrosse", "f-main", [1, 3, 5], "06:00:00", "07:30:00"),
    // SPEC 4.3 required case: two permits for Org 1 plus Org 2 back-to-back, no conflicts.
    permit("Org 1", "f-main", [1], "17:00:00", "18:00:00"),
    permit("Org 1", "f-main", [2], "18:00:00", "19:00:00"), // Tue 6-7 PM; conflicts with Kailua/Windward, not with Org 2
    permit("Org 2", "f-main", [2], "15:00:00", "16:00:00"),
    // Back-to-back with Org 1's Monday slot: never a conflict.
    permit("Keolu Ultimate", "f-main", [1], "18:00:00", "19:30:00"),
    // Overlapping fields, shown striped and labeled.
    permit("North Shore Rugby", "f-north", [3], "06:30:00", "08:00:00"), // conflicts Wed with Lanikai Lacrosse
    permit("Mid-Pac Soccer Club", "f-north", [6], "09:00:00", "11:00:00"),
    permit("Kailua Little League", "f-diamond", [0, 6], "08:00:00", "12:00:00"),
    permit("Kailua Little League", "f-diamond", [4], "18:00:00", "20:00:00"), // conflicts Thu with Windward FC
    // Not shown when Field 1 is selected (no overlap with Field 5), and a broken permit.
    permit("Castle Football", "f-far", [1, 2, 3], "16:00:00", "18:00:00"),
    permit("Unmatched Club", null, [1], "17:00:00", "18:00:00"),
    // Out-of-hours: accepted on import, so the calendar widens its range instead of hiding it.
    permit("Early Birds Running", "f-main", [6], "04:30:00", "05:30:00"),
  ];
}

export function CalendarDemoPage() {
  const [permits, setPermits] = useState<Permit[]>(initialPermits);
  const [selectedFieldId, setSelectedFieldId] = useState("f-main");
  const [editable, setEditable] = useState(true);
  const [failSaves, setFailSaves] = useState(false);
  const [open, setOpen] = useState(true);
  const [log, setLog] = useState<string[]>([]);

  const conflictsByPermit = useMemo(() => computeConflicts(permits, OVERLAPS), [permits]);
  const conflictingPermitIds = useMemo(() => new Set([...conflictsByPermit].filter(([, list]) => list.length).map(([id]) => id)), [conflictsByPermit]);
  const visibleFields = useMemo(() => {
    const neighbours = new Set(OVERLAPS.flatMap(({ field_a, field_b }) => (field_a === selectedFieldId ? [field_b] : field_b === selectedFieldId ? [field_a] : [])));
    return FIELDS.filter((f) => f.id === selectedFieldId || neighbours.has(f.id));
  }, [selectedFieldId]);

  async function handleChange(updated: Permit) {
    const before = permits.find((p) => p.id === updated.id);
    const entry = `${updated.organization} (${updated.id}): ${before ? `${formatDays(before.days)} ${formatTimeRange(before.start_time, before.end_time)}` : "?"} → ${formatDays(updated.days)} ${formatTimeRange(updated.start_time, updated.end_time)}`;
    if (failSaves) {
      setLog((l) => [`FAILED ${entry}`, ...l]);
      throw new Error("simulated network failure");
    }
    setLog((l) => [entry, ...l]);
    setPermits((list) => list.map((p) => (p.id === updated.id ? updated : p)));
  }

  return (
    <main className="calendar-demo">
      <section className="calendar-demo__panel">
        <h1>PermitCalendar demo (development only)</h1>
        <div className="calendar-demo__controls">
          <label>Selected field{" "}
            <select value={selectedFieldId} onChange={(e) => setSelectedFieldId(e.target.value)}>
              {FIELDS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
          <label><input type="checkbox" checked={editable} onChange={(e) => setEditable(e.target.checked)} /> Edit mode</label>
          <label><input type="checkbox" checked={failSaves} onChange={(e) => setFailSaves(e.target.checked)} /> Simulate save failure</label>
          <button onClick={() => { setPermits(initialPermits()); setLog([]); }}>Reset data</button>
          <button onClick={() => setOpen(true)}>Open calendar</button>
        </div>
        <h2>onPermitChange log</h2>
        <ol className="calendar-demo__log" data-testid="change-log">{log.map((line, i) => <li key={log.length - i}>{line}</li>)}</ol>
      </section>
      <div className="calendar-demo__stage">
        {open && (
          <PermitCalendar
            permits={permits}
            fields={visibleFields}
            selectedFieldId={selectedFieldId}
            conflictingPermitIds={conflictingPermitIds}
            conflictsByPermit={conflictsByPermit}
            editable={editable}
            onBack={() => setOpen(false)}
            onPermitChange={handleChange}
          />
        )}
      </div>
    </main>
  );
}
