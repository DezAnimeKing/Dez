// Date helpers. Dates are stored as local "YYYY-MM-DD" keys so a day never
// shifts under the user when the timezone offset changes.

export const DAY_MS = 86400000;
export const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function toKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fromKey(key) {
  if (!key) return null;
  const [y, m, d] = String(key).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export const todayKey = () => toKey(new Date());

export function addDays(date, amount) {
  const d = date instanceof Date ? new Date(date) : fromKey(date);
  if (!d) return null;
  d.setDate(d.getDate() + amount);
  return d;
}

export const shiftKey = (key, amount) => toKey(addDays(fromKey(key) || new Date(), amount));

export function diffDays(aKey, bKey = todayKey()) {
  const a = fromKey(aKey);
  const b = fromKey(bKey);
  if (!a || !b) return 0;
  return Math.round((startOfDay(a) - startOfDay(b)) / DAY_MS);
}

export function startOfWeek(date = new Date(), weekStart = 1) {
  const d = startOfDay(date);
  const shift = (d.getDay() - weekStart + 7) % 7;
  d.setDate(d.getDate() - shift);
  return d;
}

export function weekKeys(date = new Date(), weekStart = 1) {
  const start = startOfWeek(date, weekStart);
  return Array.from({ length: 7 }, (_, i) => toKey(addDays(start, i)));
}

export function monthMatrix(year, month, weekStart = 1) {
  const first = new Date(year, month, 1);
  const start = startOfWeek(first, weekStart);
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const d = addDays(start, i);
    cells.push({ key: toKey(d), date: d, inMonth: d.getMonth() === month });
  }
  // Trim a trailing all-outside week so short months don't render a dead row.
  if (cells.slice(35).every((c) => !c.inMonth)) cells.length = 35;
  return cells;
}

export function dowLabels(weekStart = 1) {
  return Array.from({ length: 7 }, (_, i) => DOW_SHORT[(weekStart + i) % 7]);
}

/** "Today", "Tomorrow", "Mon 22", "12 Sep 2025" depending on distance. */
export function formatDay(key, { weekday = true } = {}) {
  const d = fromKey(key);
  if (!d) return "";
  const delta = diffDays(key);
  if (delta === 0) return "Today";
  if (delta === 1) return "Tomorrow";
  if (delta === -1) return "Yesterday";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const md = `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
  if (Math.abs(delta) <= 6 && weekday) return `${DOW_SHORT[d.getDay()]} ${md}`;
  return sameYear ? md : `${md}, ${d.getFullYear()}`;
}

export const DOW_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function formatLongDay(key) {
  const d = fromKey(key) || new Date();
  return `${DOW_LONG[d.getDay()]} · ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function formatFullDate(date = new Date()) {
  return `${DOW_LONG[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** "2h ago", "3d ago", "just now" */
export function relativeTime(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 31) return `${Math.round(days / 7)}w ago`;
  return formatDay(toKey(new Date(then)), { weekday: false });
}

export function formatClock(totalSeconds) {
  const safe = Math.max(0, Math.round(totalSeconds));
  const m = String(Math.floor(safe / 60)).padStart(2, "0");
  const s = String(safe % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export function formatTime(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m || 0).padStart(2, "0")} ${period}`;
}

export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
