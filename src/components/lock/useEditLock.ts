import { useEffect, useSyncExternalStore } from "react";
import { editLock, type EditLockState } from "../../data/lock";

/**
 * Subscribes a component to this tab's edit lock and keeps the lock's timers running while
 * mounted. Leaving the page (unmount, e.g. sign-out) releases the lock.
 */
export function useEditLock(versionId: string | null, label: string): EditLockState {
  const state = useSyncExternalStore(editLock.subscribe, editLock.getState);
  useEffect(() => {
    editLock.start(versionId, label);
    return () => { void editLock.stop(); };
  }, [versionId, label]);
  return state;
}
