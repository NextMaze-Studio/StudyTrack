/* ============================================================
   StudyFlow — spaced repetition engine
   A simple, forgiving Leitner/Ebbinghaus-style scheduler.
   Each successful review pushes the next review further out.
   ============================================================ */
import { addDays, dateKey } from "./utils.js";

/** Days between reviews, growing each time a topic is reviewed. */
export const INTERVALS = [1, 3, 7, 14, 30, 60, 120, 240, 365];

/** "Again" (forgot) resets the topic back to the first interval. */
export const AGAIN_INTERVAL_INDEX = 0;

export function intervalDays(index) {
  return INTERVALS[Math.min(Math.max(index, 0), INTERVALS.length - 1)];
}

/** Build the date key of the next review for a given interval index. */
export function nextReviewDate(index, from = new Date()) {
  return dateKey(addDays(from, intervalDays(index)));
}

/** Create a brand-new topic object to be saved for a user. */
export function makeTopic(name, subject, from = new Date()) {
  return {
    name: name.trim(),
    subject: (subject || "").trim(),
    createdAt: Date.now(),
    lastReviewed: null,
    intervalIndex: 0,
    reviewCount: 0,
    nextReviewDate: nextReviewDate(0, from),
    history: []
  };
}

/**
 * Return an updated copy of a topic after the user reviews it.
 * @param {"good"|"again"} grade
 */
export function gradeTopic(topic, grade = "good", from = new Date()) {
  const idx = grade === "again"
    ? AGAIN_INTERVAL_INDEX
    : Math.min(topic.intervalIndex + 1, INTERVALS.length - 1);
  const t = { ...topic };
  t.intervalIndex = idx;
  t.reviewCount = (t.reviewCount || 0) + 1;
  t.lastReviewed = Date.now();
  t.nextReviewDate = nextReviewDate(idx, from);
  t.history = [...(t.history || []), { at: t.lastReviewed, grade }];
  return t;
}

export function isDue(topic, todayKey = dateKey()) {
  return topic.nextReviewDate <= todayKey;
}

/** Days until the next review (0 = today, negative = overdue). */
export function daysUntil(topic, todayKey = dateKey()) {
  const [ay, am, ad] = topic.nextReviewDate.split("-").map(Number);
  const [by, bm, bd] = todayKey.split("-").map(Number);
  const a = Date.UTC(ay, am - 1, ad), b = Date.UTC(by, bm - 1, bd);
  return Math.round((a - b) / 86400000);
}

export function dueLabel(topic, todayKey = dateKey()) {
  const d = daysUntil(topic, todayKey);
  if (d < 0) return `${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} overdue`;
  if (d === 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  return `Due in ${d} days`;
}
