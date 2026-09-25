/** Strict wall-clock interval overlap; touching endpoints are not a conflict. */
export function timesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  return startA < endB && startB < endA;
}

export function isValidTimeRange(start: string, end: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(start) &&
    /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(end) && start < end;
}
