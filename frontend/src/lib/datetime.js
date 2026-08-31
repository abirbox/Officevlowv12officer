/**
 * Centralized date/time helpers using the VIEWER'S local timezone.
 *
 * The active timezone is auto-detected from the browser/device on load, and
 * can be overridden per-user via the timezone menu (persisted to localStorage
 * and to the user's account). Every time value in the app is formatted through
 * these helpers so each user sees times in their own local zone.
 *
 * IMPORTANT — "business dates" (a schedule's assigned date, a wage-report
 * month, an invoice period) are stored as plain calendar dates (YYYY-MM-DD).
 * These are NOT timezone-shifted: a shift dated June 1 always shows June 1 for
 * everyone. Only real timestamps (with a time component) are converted to the
 * viewer's local zone.
 */

export const TZ_PREF_KEY = 'officeflow_tz_pref';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

const detectBrowserTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

const readStoredPref = () => {
  try {
    return localStorage.getItem(TZ_PREF_KEY);
  } catch {
    return null;
  }
};

// Active timezone, initialized synchronously at import time to avoid a flash of
// the wrong zone: a saved manual preference wins, otherwise the browser zone.
let ACTIVE_TZ = (() => {
  const pref = readStoredPref();
  return pref && pref !== 'auto' ? pref : detectBrowserTz();
})();

export const setActiveTimezone = (tz) => {
  ACTIVE_TZ = tz && tz !== 'auto' ? tz : detectBrowserTz();
  return ACTIVE_TZ;
};

export const getActiveTimezone = () => ACTIVE_TZ;
export const getBrowserTimezone = () => detectBrowserTz();

const toDate = (input) => {
  if (input == null || input === '') return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
};

const isDateOnly = (input) => typeof input === 'string' && DATE_ONLY_RE.test(input.trim());

// A date-only string rendered at UTC noon so tz math never shifts the day.
const dateOnlyToUtcNoon = (input) => {
  const [y, m, d] = input.trim().split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
};

/** Short timezone abbreviation for the active zone, e.g. "GMT+6", "PST". */
export const tzAbbrev = (input) => {
  const d = toDate(input) || new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: ACTIVE_TZ, timeZoneName: 'short',
    }).formatToParts(d);
    const p = parts.find((x) => x.type === 'timeZoneName');
    return p ? p.value : '';
  } catch {
    return '';
  }
};

/** ISO date (YYYY-MM-DD) in the active zone. Input defaults to now. */
export const dhakaDateIso = (input) => {
  if (isDateOnly(input)) return input.trim();
  const d = toDate(input) || new Date();
  return d.toLocaleDateString('en-CA', { timeZone: ACTIVE_TZ });
};

/** Today's ISO date in the active (viewer's) zone. */
export const todayIso = () => dhakaDateIso(new Date());

/** Human-friendly date, e.g. "27 Aug 2026". Business dates are not shifted. */
export const formatDate = (input) => {
  if (isDateOnly(input)) {
    return dateOnlyToUtcNoon(input).toLocaleDateString('en-GB', {
      timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric',
    });
  }
  const d = toDate(input);
  if (!d) return '';
  return d.toLocaleDateString('en-GB', {
    timeZone: ACTIVE_TZ, day: '2-digit', month: 'short', year: 'numeric',
  });
};

/** Time only (24h) in the viewer's zone, e.g. "14:35" or "14:35 GMT+6". */
export const formatTime = (input, { withZone = false, ...opts } = {}) => {
  const d = toDate(input);
  if (!d) return '';
  const s = d.toLocaleTimeString('en-GB', {
    timeZone: ACTIVE_TZ, hour: '2-digit', minute: '2-digit', hour12: false, ...opts,
  });
  return withZone ? `${s} ${tzAbbrev(d)}` : s;
};

/** Full date + time in the viewer's zone, e.g. "27 Aug 2026, 14:35 GMT+6". */
export const formatDateTime = (input, { withZone = true } = {}) => {
  const d = toDate(input);
  if (!d) return '';
  const s = d.toLocaleString('en-GB', {
    timeZone: ACTIVE_TZ,
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  return withZone ? `${s} ${tzAbbrev(d)}` : s;
};

/** Long weekday + date, e.g. "Thursday, 27 August 2026". */
export const formatLongDate = (input) => {
  if (isDateOnly(input)) {
    return dateOnlyToUtcNoon(input).toLocaleDateString('en-GB', {
      timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }
  const d = toDate(input);
  if (!d) return '';
  return d.toLocaleDateString('en-GB', {
    timeZone: ACTIVE_TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
};

/** Month + year, e.g. "August 2026". */
export const formatMonth = (input) => {
  if (isDateOnly(input)) {
    return dateOnlyToUtcNoon(input).toLocaleDateString('en-GB', {
      timeZone: 'UTC', month: 'long', year: 'numeric',
    });
  }
  const d = toDate(input);
  if (!d) return '';
  return d.toLocaleDateString('en-GB', {
    timeZone: ACTIVE_TZ, month: 'long', year: 'numeric',
  });
};

/**
 * Returns `{ y, m, d, hh, mm, ss }` in the active zone for calendar math.
 * Date-only strings are parsed literally (no shift).
 */
export const dhakaParts = (input) => {
  if (isDateOnly(input)) {
    const [y, m, d] = input.trim().split('-').map(Number);
    return { y, m, d, hh: 0, mm: 0, ss: 0 };
  }
  const d = toDate(input) || new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ACTIVE_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d).reduce((acc, p) => (p.type !== 'literal' ? { ...acc, [p.type]: p.value } : acc), {});
  return {
    y: Number(parts.year), m: Number(parts.month), d: Number(parts.day),
    hh: Number(parts.hour), mm: Number(parts.minute), ss: Number(parts.second),
  };
};

/** First day of the current month in the active zone, ISO (YYYY-MM-DD). */
export const firstOfMonthIso = (input) => {
  const p = dhakaParts(input);
  return `${p.y}-${String(p.m).padStart(2, '0')}-01`;
};

/** Last day of the current month in the active zone, ISO (YYYY-MM-DD). */
export const lastOfMonthIso = (input) => {
  const p = dhakaParts(input);
  const daysInMonth = new Date(Date.UTC(p.y, p.m, 0)).getUTCDate();
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
};
