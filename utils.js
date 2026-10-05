/* ============================================================
   StudyFlow — shared helpers
   ============================================================ */

export const DAY_MS = 86400000;

export function pad(n) { return String(n).padStart(2, "0"); }

/** Seconds -> "2h 15m" (or "45m", or "0m") */
export function formatDuration(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  if (m) return `${m}m`;
  return sec > 0 ? "<1m" : "0m";
}

/** Seconds -> "1h 04m 09s" style, used in the timer + session meta */
export function formatHMS(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Seconds -> "01:04:09" clock string for the big timer display */
export function formatClock(sec) { return formatHMS(sec); }

export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Local date key, e.g. "2026-10-05" (never UTC — avoids timezone bugs) */
export function dateKey(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

export function keyToDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Monday-based ISO-ish week key, e.g. "2026-W41" */
export function weekKey(d = new Date()) {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // 0 = Monday
  const monday = addDays(x, -day);
  // Week number relative to that year's first Monday-ish — good enough for grouping.
  const jan1 = new Date(monday.getFullYear(), 0, 1);
  const week = Math.floor((monday - jan1) / DAY_MS / 7) + 1;
  return `${monday.getFullYear()}-W${pad(week)}`;
}

export function monthKey(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function humanDay(key) {
  const d = keyToDate(key);
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function humanDayFromDate(d) {
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function relativeDayLabel(key) {
  const today = dateKey();
  const yesterday = dateKey(addDays(new Date(), -1));
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return humanDay(key);
}

export function humanTime(ts) {
  const d = new Date(ts);
  let h = d.getHours();
  const m = pad(d.getMinutes());
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

export function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Deterministic pastel/primary colour per subject name */
export function colorFor(name) {
  const palette = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#06b6d4", "#84cc16"];
  let h = 0;
  for (let i = 0; i < String(name).length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

/** Turn an array of sessions into aggregate stats */
export function computeStats(sessions, now = new Date()) {
  const stats = { totalSec: 0, weekSec: 0, monthSec: 0, sessionCount: sessions.length, streak: 0, lastStudyDate: null };
  const wk = weekKey(now), mk = monthKey(now);
  const daySet = new Set();
  let maxKey = null;
  for (const s of sessions) {
    stats.totalSec += s.durationSec || 0;
    if (s.dateKey) {
      daySet.add(s.dateKey);
      if (!maxKey || s.dateKey > maxKey) maxKey = s.dateKey;
    }
    const sd = new Date(s.start);
    if (weekKey(sd) === wk) stats.weekSec += s.durationSec || 0;
    if (monthKey(sd) === mk) stats.monthSec += s.durationSec || 0;
  }
  stats.lastStudyDate = maxKey;

  // Streak: consecutive days ending today or yesterday.
  let cursor = startOfDay(now);
  if (!daySet.has(dateKey(cursor))) cursor = addDays(cursor, -1); // grace: today not required yet
  while (daySet.has(dateKey(cursor))) { stats.streak++; cursor = addDays(cursor, -1); }
  return stats;
}

/** Total seconds studied within the last N days (inclusive of today), N>=1 */
export function secondsInLastDays(sessions, n, now = new Date()) {
  const from = startOfDay(addDays(now, -(n - 1))).getTime();
  const to = startOfDay(addDays(now, 1)).getTime();
  let sum = 0;
  for (const s of sessions) if (s.start >= from && s.start < to) sum += s.durationSec || 0;
  return sum;
}
