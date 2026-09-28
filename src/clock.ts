// Single time source for the backend logic. The test build shifts it to seed
// realistic history; production never changes the offset.
let offsetMs = 0;
export const setClockOffset = (ms: number) => {
  offsetMs = ms;
};
export const now = () => new Date(Date.now() + offsetMs);
export const nowIso = () => now().toISOString();
/** yyyy-mm-dd in the device's local time zone. */
export const localDate = (d: Date = new Date()) =>
  d.getFullYear() +
  '-' +
  String(d.getMonth() + 1).padStart(2, '0') +
  '-' +
  String(d.getDate()).padStart(2, '0');
