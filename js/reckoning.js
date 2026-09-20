/* Dual (in fact N-fold) calendar.
 *
 * The world counts years from more than one origin event. A single moment
 * therefore has several valid labels. To keep them from drifting apart we
 * store ONE canonical year per event and convert at display time.
 *
 *   canonical  — years since the canonical origin (Fall Reckoning year 0)
 *   reckoning  — { offsetFromCanonicalZero }, the canonical year at which
 *                that reckoning's own year zero falls
 *
 *   display   = canonical - offset
 *   canonical = display   + offset
 *
 * The Unhoming happens at Fall +50, so its offset is 50 and
 * Fall 666 === Unhoming 616.
 */

export const CANONICAL_RECKONING_ID = 'rkn_fall';

export const DEFAULT_RECKONINGS = Object.freeze([
  { id: CANONICAL_RECKONING_ID, name: 'Fall Reckoning',     abbr: 'FR', offsetFromCanonicalZero: 0 },
  { id: 'rkn_unhoming',         name: 'Unhoming Reckoning', abbr: 'UR', offsetFromCanonicalZero: 50 },
]);

/** A year as the author would write it in `reckoning`, from storage. */
export function toDisplayYear(canonicalYear, reckoning) {
  if (canonicalYear == null) return null;
  return canonicalYear - (reckoning?.offsetFromCanonicalZero ?? 0);
}

/** A year as the author typed it in `reckoning`, for storage. */
export function toCanonicalYear(displayYear, reckoning) {
  if (displayYear == null) return null;
  return displayYear + (reckoning?.offsetFromCanonicalZero ?? 0);
}

/** Same moment, relabelled from one reckoning into another. */
export function convertYear(year, fromReckoning, toReckoning) {
  return toDisplayYear(toCanonicalYear(year, fromReckoning), toReckoning);
}

const EN_DASH = '–';

/**
 * Render an event's date. Handles points, spans and approximation:
 *   666            →  "666 FR"
 *   c. 450         →  "c. 450 FR"
 *   450–616        →  "450–616 FR"
 * Negative years read as "before" the origin.
 */
export function formatYear(entity, reckoning, { showAbbr = true } = {}) {
  const start = toDisplayYear(entity.yearStart, reckoning);
  if (start == null) return 'undated';
  const end = toDisplayYear(entity.yearEnd, reckoning);

  const num = (y) => (y < 0 ? `${Math.abs(y)} before` : String(y));
  let text = end != null && end !== start ? `${num(start)}${EN_DASH}${num(end)}` : num(start);
  if (entity.approximate) text = `c. ${text}`;
  const abbr = showAbbr && reckoning?.abbr ? ` ${reckoning.abbr}` : '';
  return text + abbr;
}

/**
 * Parse what the author typed into canonical storage values.
 * Accepts: "666", "c. 450", "~450", "450-616", "450–616", "450 to 616", "-30".
 * Returns { yearStart, yearEnd, approximate } in CANONICAL years, or null
 * when the input is not a date — never a silent 0.
 */
const YEAR_INPUT = /^(-?\d+)(?:\s*(?:--|—|–|-|\bto\b)\s*(-?\d+))?$/;

export function parseYearInput(input, reckoning) {
  if (input == null) return null;
  let s = String(input).trim().toLowerCase().replace(/,/g, '');
  if (!s) return null;

  let approximate = false;
  const circa = /^(c\.|ca\.|circa|~|about|around)\s*/;
  if (circa.test(s)) {
    approximate = true;
    s = s.replace(circa, '').trim();
  }

  const match = YEAR_INPUT.exec(s);
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  return {
    yearStart: toCanonicalYear(Number(rawStart), reckoning),
    yearEnd: rawEnd == null ? null : toCanonicalYear(Number(rawEnd), reckoning),
    approximate,
  };
}

/** Does a dated entity fall inside a canonical [from, to] window? */
export function withinRange(entity, fromCanonical, toCanonical) {
  if (entity.yearStart == null) return false;
  const start = entity.yearStart;
  const end = entity.yearEnd ?? entity.yearStart;
  if (fromCanonical != null && end < fromCanonical) return false;
  if (toCanonical != null && start > toCanonical) return false;
  return true;
}
