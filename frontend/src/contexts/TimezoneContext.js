import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/axios';
import useAuthStore from '@/stores/authStore';
import {
  TZ_PREF_KEY,
  setActiveTimezone,
  getActiveTimezone,
  getBrowserTimezone,
  tzAbbrev,
} from '@/lib/datetime';

// Common IANA zones for the picker. The auto-detected device zone is always
// available even if it is not in this list.
export const TIMEZONE_OPTIONS = [
  { code: 'Pacific/Honolulu', label: 'Honolulu (UTC-10)' },
  { code: 'America/Anchorage', label: 'Anchorage (UTC-9)' },
  { code: 'America/Los_Angeles', label: 'Los Angeles (UTC-8/-7)' },
  { code: 'America/Denver', label: 'Denver (UTC-7/-6)' },
  { code: 'America/Chicago', label: 'Chicago (UTC-6/-5)' },
  { code: 'America/New_York', label: 'New York (UTC-5/-4)' },
  { code: 'America/Sao_Paulo', label: 'São Paulo (UTC-3)' },
  { code: 'UTC', label: 'UTC (UTC+0)' },
  { code: 'Europe/London', label: 'London (UTC+0/+1)' },
  { code: 'Europe/Paris', label: 'Paris / Berlin (UTC+1/+2)' },
  { code: 'Europe/Athens', label: 'Athens (UTC+2/+3)' },
  { code: 'Europe/Moscow', label: 'Moscow (UTC+3)' },
  { code: 'Asia/Dubai', label: 'Dubai (UTC+4)' },
  { code: 'Asia/Karachi', label: 'Karachi (UTC+5)' },
  { code: 'Asia/Kolkata', label: 'India (UTC+5:30)' },
  { code: 'Asia/Dhaka', label: 'Bangladesh (UTC+6)' },
  { code: 'Asia/Bangkok', label: 'Bangkok / Jakarta (UTC+7)' },
  { code: 'Asia/Singapore', label: 'Singapore (UTC+8)' },
  { code: 'Asia/Shanghai', label: 'Shanghai (UTC+8)' },
  { code: 'Asia/Tokyo', label: 'Tokyo (UTC+9)' },
  { code: 'Australia/Sydney', label: 'Sydney (UTC+10/+11)' },
  { code: 'Pacific/Auckland', label: 'Auckland (UTC+12/+13)' },
];

const readPref = () => {
  try {
    return localStorage.getItem(TZ_PREF_KEY);
  } catch {
    return null;
  }
};

const TimezoneContext = createContext({
  timezone: getActiveTimezone(),
  preference: 'auto',
  browserTimezone: getBrowserTimezone(),
  abbrev: '',
  options: TIMEZONE_OPTIONS,
  setPreference: () => {},
});

export const TimezoneProvider = ({ children }) => {
  const { user } = useAuthStore();
  const [preference, setPreferenceState] = useState(() => readPref() || 'auto');
  const timezone = getActiveTimezone();
  const browserTimezone = getBrowserTimezone();

  // Adopt the account-saved timezone on a device that has no local override.
  useEffect(() => {
    if (!user) return;
    const localPref = readPref();
    if (localPref) return; // device-level override always wins
    const serverTz = user.timezone;
    if (serverTz && serverTz !== getActiveTimezone()) {
      try {
        localStorage.setItem(TZ_PREF_KEY, serverTz);
      } catch {
        /* ignore */
      }
      setActiveTimezone(serverTz);
      if (!sessionStorage.getItem('tz_synced')) {
        sessionStorage.setItem('tz_synced', '1');
        window.location.reload();
      }
    }
  }, [user]);

  const setPreference = (pref) => {
    const value = pref || 'auto';
    try {
      if (value === 'auto') localStorage.removeItem(TZ_PREF_KEY);
      else localStorage.setItem(TZ_PREF_KEY, value);
    } catch {
      /* ignore */
    }
    setActiveTimezone(value);
    setPreferenceState(value);
    // Persist to the account (best-effort) — null clears it so other devices
    // fall back to their own auto-detection.
    api.put('/auth/me/timezone', { timezone: value === 'auto' ? null : value }).catch(() => {});
    // Reload so every already-rendered time re-formats in the new zone.
    window.location.reload();
  };

  const value = useMemo(
    () => ({
      timezone,
      preference,
      browserTimezone,
      abbrev: tzAbbrev(),
      options: TIMEZONE_OPTIONS,
      setPreference,
    }),
    [timezone, preference, browserTimezone],
  );

  return <TimezoneContext.Provider value={value}>{children}</TimezoneContext.Provider>;
};

export const useTimezone = () => useContext(TimezoneContext);
