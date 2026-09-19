// Natural-language quick add:  "Call the plumber tomorrow at 9am !high #home +errand"
import { todayKey, shiftKey, toKey, fromKey } from "./date.js";

const WEEKDAYS = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5, sat: 6, saturday: 6,
};
const MONTHS = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
  september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};
const PRIORITY_WORDS = {
  high: "high", h: "high", "1": "high", urgent: "high",
  med: "medium", medium: "medium", m: "medium", "2": "medium",
  low: "low", l: "low", "3": "low",
};

function nextWeekday(target, { forceNext = false } = {}) {
  const today = new Date();
  const current = today.getDay();
  let delta = (target - current + 7) % 7;
  if (delta === 0 && !forceNext) delta = 0;
  if (forceNext || delta === 0) delta = delta === 0 && forceNext ? 7 : delta;
  if (delta === 0 && !forceNext) return todayKey();
  return shiftKey(todayKey(), delta);
}

function normalizeTime(hour, minute, meridiem) {
  let h = Number(hour);
  const m = Number(minute || 0);
  if (Number.isNaN(h) || h > 23 || m > 59) return null;
  if (meridiem === "pm" && h < 12) h += 12;
  if (meridiem === "am" && h === 12) h = 0;
  if (!meridiem && h <= 7) h += 12; // "at 3" on a to-do list means the afternoon
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * @param {string} input
 * @param {{projects?: Array<{id:string,name:string}>}} context
 */
export function parseQuickAdd(input, context = {}) {
  const projects = context.projects || [];
  const out = { title: "", projectId: null, tags: [], priority: "none", due: null, time: null };
  let text = ` ${String(input || "")} `;

  const eat = (regex, handler) => {
    text = text.replace(regex, (...args) => {
      const groups = args.slice(1, -2);
      const replacement = handler(...groups);
      return replacement === false ? args[0] : " ";
    });
  };

  // #project — match on prefix, then on substring
  eat(/\s#([\w-]+)/gi, (name) => {
    const needle = name.toLowerCase().replace(/-/g, " ");
    const match =
      projects.find((p) => p.name.toLowerCase().startsWith(needle)) ||
      projects.find((p) => p.name.toLowerCase().includes(needle));
    if (!match) return false;
    out.projectId = match.id;
    return " ";
  });

  // +tag / @tag
  eat(/\s[+@]([\w-]+)/g, (tag) => {
    const clean = tag.toLowerCase();
    if (!out.tags.includes(clean)) out.tags.push(clean);
    return " ";
  });

  // !priority
  eat(/\s!(\w+)/gi, (word) => {
    const priority = PRIORITY_WORDS[word.toLowerCase()];
    if (!priority) return false;
    out.priority = priority;
    return " ";
  });

  // explicit ISO date
  eat(/\s(\d{4})-(\d{2})-(\d{2})\b/g, (y, m, d) => {
    out.due = `${y}-${m}-${d}`;
    return " ";
  });

  // d/m or m/d style — interpreted as month/day, the common shorthand
  eat(/\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g, (a, b, y) => {
    const month = Number(a) - 1;
    const day = Number(b);
    if (month < 0 || month > 11 || day < 1 || day > 31) return false;
    const year = y ? (Number(y) < 100 ? 2000 + Number(y) : Number(y)) : new Date().getFullYear();
    const candidate = new Date(year, month, day);
    if (!y && candidate < new Date(new Date().toDateString())) candidate.setFullYear(year + 1);
    out.due = toKey(candidate);
    return " ";
  });

  // "12 sep" / "sep 12"
  eat(/\s(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/gi, (day, month) => {
    out.due = monthDayKey(MONTHS[month.toLowerCase()], Number(day));
    return " ";
  });
  eat(/\s(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{1,2})\b/gi, (month, day) => {
    out.due = monthDayKey(MONTHS[month.toLowerCase()], Number(day));
    return " ";
  });

  // relative words
  eat(/\s(today|tonight|tdy)\b/gi, () => { out.due = todayKey(); return " "; });
  eat(/\s(tomorrow|tmr|tmrw)\b/gi, () => { out.due = shiftKey(todayKey(), 1); return " "; });
  eat(/\sin\s+(\d{1,3})\s+(day|days|week|weeks|month|months)\b/gi, (amount, unit) => {
    const n = Number(amount);
    const mult = unit.startsWith("week") ? 7 : unit.startsWith("month") ? 30 : 1;
    out.due = shiftKey(todayKey(), n * mult);
    return " ";
  });
  eat(/\snext\s+week\b/gi, () => { out.due = shiftKey(todayKey(), 7); return " "; });
  eat(/\snext\s+(sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat)[a-z]*\b/gi, (day) => {
    out.due = nextWeekday(WEEKDAYS[day.toLowerCase()], { forceNext: true });
    return " ";
  });
  eat(/\s(?:on\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, (day) => {
    out.due = nextWeekday(WEEKDAYS[day.toLowerCase()]);
    return " ";
  });

  // times: "at 9", "at 9:30pm", "9pm"
  eat(/\sat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/gi, (hour, minute, meridiem) => {
    const time = normalizeTime(hour, minute, meridiem?.toLowerCase());
    if (!time) return false;
    out.time = time;
    return " ";
  });
  eat(/\s(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi, (hour, minute, meridiem) => {
    const time = normalizeTime(hour, minute, meridiem.toLowerCase());
    if (!time) return false;
    out.time = time;
    return " ";
  });

  out.title = text.replace(/\s+/g, " ").trim();
  if (out.time && !out.due) out.due = todayKey();
  return out;
}

function monthDayKey(month, day) {
  if (month === undefined || !day) return null;
  const year = new Date().getFullYear();
  const candidate = new Date(year, month, day);
  if (candidate < new Date(new Date().toDateString())) candidate.setFullYear(year + 1);
  return toKey(candidate);
}

/** Human summary of what quick-add understood, shown under the input. */
export function describeParse(parsed, projects = []) {
  const bits = [];
  if (parsed.due) bits.push({ icon: "calendar", text: parsed.due === todayKey() ? "Today" : labelFor(parsed.due) });
  if (parsed.time) bits.push({ icon: "clock", text: parsed.time });
  if (parsed.priority !== "none") bits.push({ icon: "flag", text: parsed.priority });
  const project = projects.find((p) => p.id === parsed.projectId);
  if (project) bits.push({ icon: "board", text: project.name });
  for (const tag of parsed.tags) bits.push({ icon: "tag", text: tag });
  return bits;
}

function labelFor(key) {
  const d = fromKey(key);
  if (!d) return key;
  return `${d.getDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]}`;
}
