import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { FieldMap } from "../components/map/FieldMap";
import { PermitCalendar } from "../components/calendar/PermitCalendar";
import { PermitSidebar } from "../components/sidebar/PermitSidebar";
import { deriveScheduleView } from "../components/share/scheduleView";
import { useSharedView } from "../components/share/useSharedView";
import "../components/share/share.css";

const readOnly = () => Promise.reject(new Error("This shared view is read-only."));
const clockTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/**
 * Public, read-only schedule at #/share/<token> (SPEC 5.8). Also the meeting's projector view:
 * the whole page uses a larger base font while it is open.
 */
export function SharePage() {
  const { token = "" } = useParams();
  const { state, refresh } = useSharedView(token);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);

  // Presentation sizing: every rem on the page scales from the root font size.
  useEffect(() => {
    document.documentElement.classList.add("presentation-mode");
    return () => document.documentElement.classList.remove("presentation-mode");
  }, []);

  const view = state.status === "ready" ? state.view : null;
  // A refresh may remove the field that is open (deleted elsewhere); close it instead of showing nothing.
  const selectedField = view?.fields.find((field) => field.id === selectedFieldId) ?? null;
  const schedule = useMemo(
    () => view ? deriveScheduleView(view.fields, view.overlaps, view.permits, selectedField?.id ?? null) : null,
    [view, selectedField?.id],
  );

  if (state.status === "loading") return <main className="share-message" role="status"><p>Loading the schedule…</p></main>;
  if (state.status === "unavailable") {
    return <main className="share-message">
      <h1>This schedule isn't available</h1>
      <p>The link may have been turned off or replaced with a new one. Please ask the Parks and Recreation office for the current link.</p>
    </main>;
  }
  if (state.status === "error" || !view || !schedule) {
    return <main className="share-message" role="alert">
      <h1>The schedule couldn't be loaded</h1>
      <p>{state.status === "error" ? state.message : "Something went wrong."}</p>
      <p>Check the internet connection. The page will keep trying every 15 seconds.</p>
      <button type="button" onClick={refresh}>Try again now</button>
    </main>;
  }

  return <div className="app-shell share-page">
    <header className="topbar share-topbar">
      <strong>Field schedule</strong>
      <span className="share-badge">View only</span>
      <span className="share-meta" aria-live="polite">
        {state.refreshError
          ? <span className="share-warning" role="alert">Can't reach the server. Showing the schedule as of {clockTime(state.updatedAt)}.</span>
          : <>Updated {clockTime(state.updatedAt)}</>}
      </span>
    </header>
    <main className="workspace">
      <FieldMap
        fields={view.fields}
        conflictingFieldIds={schedule.conflictingFieldIds}
        selectedFieldId={selectedField?.id ?? null}
        editable={false}
        onFieldSelect={setSelectedFieldId}
        homeCenter={view.settings.home_center}
        homeZoom={view.settings.home_zoom}
        onHomeViewChange={() => undefined}
        onGeometryChange={readOnly}
      />
      <PermitSidebar
        field={selectedField}
        fields={view.fields}
        permits={schedule.sidebarPermits}
        conflictsByPermit={schedule.conflictsByPermit}
        editMode={false}
        onClose={() => setSelectedFieldId(null)}
        onExpandCalendar={() => setShowCalendar(true)}
        onSavePermit={readOnly}
        onDeletePermit={readOnly}
      />
      {showCalendar && selectedField && <PermitCalendar
        permits={schedule.calendarPermits}
        fields={schedule.calendarFields}
        selectedFieldId={selectedField.id}
        conflictingPermitIds={schedule.calendarConflictIds}
        conflictsByPermit={schedule.conflictsByPermit}
        editable={false}
        onBack={() => setShowCalendar(false)}
        onPermitChange={readOnly}
      />}
    </main>
  </div>;
}
