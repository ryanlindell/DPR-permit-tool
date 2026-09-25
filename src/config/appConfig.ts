export const appConfig = {
  colors: { normal: "#197a58", conflict: "#bd3f35" },
  calendar: { startHour: 5, endHour: 22, snapMinutes: 15 },
  overlapAreaThresholdSquareMeters: 1,
  editLockStaleAfterSeconds: 120,
  editLockHeartbeatSeconds: 30,
} as const;
