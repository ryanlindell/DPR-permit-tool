import { useMemo, useState, type CSSProperties } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg, EventContentArg, EventDropArg } from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import { appConfig } from "../../config/appConfig";
import { permitSchema } from "../../config/permitSchema";
import type { Conflict, Field, Permit } from "../../types";
import {
  DAY_LONG, GENERIC_WEEK_END, GENERIC_WEEK_START, applyOccurrenceChange, buildOccurrences, canDropOnDay, describeConflict, formatDays, formatTimeRange,
  fromCalendarDate, visibleRange, type OccurrenceProps,
} from "./calendarModel";
import "./PermitCalendar.css";

/** Contract for a self-contained weekly calendar. Data fetching and persistence stay outside this component. */
export interface PermitCalendarProps {
  /** Permits for the active schedule version. */
  permits: Permit[];
  /** Fields used to label and visually distinguish adjacent-field occurrences. */
  fields: Field[];
  /** Field whose schedule is open in the calendar. */
  selectedFieldId: string;
  /** IDs with at least one conflict, used for event styling. */
  conflictingPermitIds: ReadonlySet<string>;
  /** Conflict relationships and intersecting weekdays, keyed by permit ID. */
  conflictsByPermit: ReadonlyMap<string, Conflict[]>;
  /** False in read-only share view; disables drag and resize. */
  editable: boolean;
  /** Close calendar and return to map while retaining selected field. */
  onBack: () => void;
  /** Emit a changed complete permit; caller validates and persists it. */
  onPermitChange: (updated: Permit) => void | Promise<void>;
  /** Optional event selection callback for a detail panel. */
  onPermitSelect?: (permit: Permit) => void;
}

type Notice = { tone: "info" | "error"; text: string } | null;

/**
 * Full-screen weekly calendar for one field (SPEC 5.5 and the calendar half of 5.6).
 *
 * Which permits appear: those on the selected field plus those on every other field in `fields`,
 * so the caller should pass the selected field and the fields that overlap it.
 *
 * The component is fully controlled: a drag or resize becomes a complete updated permit emitted
 * through onPermitChange, and FullCalendar's own copy of the event is reverted so positions always
 * come from the `permits` prop. When the caller applies the change the event re-renders in its new
 * place; when it does not, the event stays where it was.
 */
export function PermitCalendar({ permits, fields, selectedFieldId, conflictingPermitIds, conflictsByPermit, editable, onBack, onPermitChange, onPermitSelect }: PermitCalendarProps) {
  const [selectedPermitId, setSelectedPermitId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const permitsById = useMemo(() => new Map(permits.map((p) => [p.id, p])), [permits]);
  const fieldNames = useMemo(() => new Map(fields.map((f) => [f.id, f.name])), [fields]);
  const events = useMemo(() => buildOccurrences(permits, fields, selectedFieldId, conflictingPermitIds), [permits, fields, selectedFieldId, conflictingPermitIds]);
  const range = useMemo(() => visibleRange(events), [events]);
  const selectedField = fields.find((f) => f.id === selectedFieldId);
  const selectedPermit = selectedPermitId ? permitsById.get(selectedPermitId) : undefined;
  const fieldName = (id: string | null) => (id && fieldNames.get(id)) || "another field";

  function emitChange(occurrence: OccurrenceProps, start: Date | null, end: Date | null, revert: () => void) {
    revert();
    const permit = permitsById.get(occurrence.permitId);
    if (!permit || !start || !end) return;
    const result = applyOccurrenceChange(permit, occurrence.day, fromCalendarDate(start), fromCalendarDate(end));
    if (result.kind === "unchanged") return;
    if (result.kind === "rejected") { setNotice({ tone: "error", text: result.reason }); return; }
    const updated = result.permit;
    setNotice({ tone: "info", text: `${updated.organization} is now ${formatDays(updated.days)} ${formatTimeRange(updated.start_time, updated.end_time)}.` });
    Promise.resolve()
      .then(() => onPermitChange(updated))
      .catch((error: unknown) => setNotice({ tone: "error", text: `Could not save the change to ${updated.organization}: ${error instanceof Error ? error.message : String(error)}` }));
  }

  function handleClick(arg: EventClickArg) {
    const { permitId } = arg.event.extendedProps as OccurrenceProps;
    setSelectedPermitId(permitId);
    const permit = permitsById.get(permitId);
    if (permit) onPermitSelect?.(permit);
  }

  const colorVars = { "--cal-normal": appConfig.colors.normal, "--cal-conflict": appConfig.colors.conflict } as CSSProperties;

  return (
    <div className="permit-calendar" style={colorVars} role="dialog" aria-modal="true" aria-labelledby="permit-calendar-title">
      <header className="permit-calendar__bar">
        <button className="permit-calendar__back" onClick={onBack}>← Back</button>
        <h2 id="permit-calendar-title">{selectedField?.name ?? "Field"}<span className="permit-calendar__subtitle"> weekly schedule{editable ? " (editing)" : ""}</span></h2>
        <ul className="permit-calendar__legend" aria-label="Legend">
          <li><span className="swatch swatch--normal" />This field</li>
          <li><span className="swatch swatch--other" />Overlapping field</li>
          <li><span className="swatch swatch--conflict" />Conflict</li>
        </ul>
      </header>
      {editable && <p className="permit-calendar__hint">Drag up or down to change the time on every day. Drag sideways to move just that day. Drag the bottom edge to change the length.</p>}
      <div className={`permit-calendar__notice${notice ? ` is-${notice.tone}` : ""}`} role="status" aria-live="polite">
        {notice && <><span>{notice.text}</span><button className="permit-calendar__dismiss" onClick={() => setNotice(null)} aria-label="Dismiss message">×</button></>}
      </div>
      <div className="permit-calendar__body">
        <div className="permit-calendar__grid">
          <FullCalendar
            plugins={[timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            timeZone="UTC"
            initialDate={GENERIC_WEEK_START}
            validRange={{ start: GENERIC_WEEK_START, end: GENERIC_WEEK_END }}
            firstDay={1}
            headerToolbar={false}
            dayHeaderContent={(arg) => DAY_LONG[arg.date.getUTCDay()]}
            allDaySlot={false}
            nowIndicator={false}
            height="100%"
            expandRows
            slotMinTime={range.slotMinTime}
            slotMaxTime={range.slotMaxTime}
            scrollTime={range.slotMinTime}
            slotDuration="00:30:00"
            snapDuration={{ minutes: appConfig.calendar.snapMinutes }}
            slotLabelInterval="01:00"
            slotEventOverlap={false}
            eventMinHeight={20}
            events={events}
            editable={editable}
            eventStartEditable={editable}
            eventDurationEditable={editable}
            eventAllow={(span, moving) => {
              if (!moving) return false;
              const occurrence = moving.extendedProps as OccurrenceProps;
              const permit = permitsById.get(occurrence.permitId);
              return !!permit && canDropOnDay(permit, occurrence.day, span.start.getUTCDay());
            }}
            eventDrop={(arg: EventDropArg) => emitChange(arg.event.extendedProps as OccurrenceProps, arg.event.start, arg.event.end, arg.revert)}
            eventResize={(arg: EventResizeDoneArg) => emitChange(arg.event.extendedProps as OccurrenceProps, arg.event.start, arg.event.end, arg.revert)}
            eventClick={handleClick}
            eventContent={renderEvent}
          />
        </div>
        {selectedPermit && (
          <PermitDetails permit={selectedPermit} fieldName={fieldName} conflicts={conflictsByPermit.get(selectedPermit.id) ?? []} onClose={() => setSelectedPermitId(null)} />
        )}
      </div>
    </div>
  );
}

function renderEvent(arg: EventContentArg) {
  const occurrence = arg.event.extendedProps as OccurrenceProps;
  const { start, end } = arg.event;
  // Our own time text (with AM/PM) so the drag preview reads exactly like the permit will.
  const time = start && end ? formatTimeRange(fromCalendarDate(start).time, fromCalendarDate(end).time) : arg.timeText;
  const where = occurrence.isOtherField ? `on ${occurrence.fieldName}` : "";
  return (
    <div className="permit-event__content" title={[occurrence.conflicting ? "Conflict:" : "", arg.event.title, time, where].filter(Boolean).join(" ")}>
      <strong className="permit-event__org">{occurrence.conflicting && <span aria-label="Conflict">⚠ </span>}{arg.event.title}</strong>
      <span className="permit-event__time">{time}</span>
      {where && <span className="permit-event__field">{where}</span>}
    </div>
  );
}

function PermitDetails({ permit, fieldName, conflicts, onClose }: { permit: Permit; fieldName: (id: string | null) => string; conflicts: Conflict[]; onClose: () => void }) {
  const extras = permitSchema.filter((a) => permit.extra[a.key] !== undefined && permit.extra[a.key] !== null && permit.extra[a.key] !== "");
  return (
    <aside className="permit-calendar__details" aria-label="Permit details">
      <button className="permit-calendar__close" onClick={onClose} aria-label="Close details">×</button>
      <h3>{permit.organization}</h3>
      <dl>
        <dt>Field</dt><dd>{fieldName(permit.field_id)}</dd>
        <dt>Time</dt><dd>{formatTimeRange(permit.start_time, permit.end_time)}</dd>
        <dt>Days</dt><dd>{formatDays(permit.days)}</dd>
        {permit.notes && <><dt>Notes</dt><dd>{permit.notes}</dd></>}
        {extras.map((a) => <div key={a.key}><dt>{a.label}</dt><dd>{String(permit.extra[a.key])}</dd></div>)}
      </dl>
      <h4 className={conflicts.length ? "has-conflicts" : undefined}>{conflicts.length ? `⚠ Conflicts (${conflicts.length})` : "No conflicts"}</h4>
      {conflicts.length > 0 && <ul className="permit-calendar__conflicts">{conflicts.map((c) => <li key={c.conflicts_with.id}>{describeConflict(c, fieldName)}</li>)}</ul>}
    </aside>
  );
}
