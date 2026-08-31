import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/lib/axios';
import { toast } from 'sonner';
import ShiftMiniMap from '@/components/ShiftMiniMap';
import {
  MapPin, Clock, LogIn, LogOut, AlertTriangle, CheckCircle2,
  XCircle, Loader2, ShieldAlert, Navigation, Hash, User, DollarSign, Timer,
} from 'lucide-react';

const EARTH_R = 6371000;
function distanceM(lat1, lon1, lat2, lon2) {
  const r = (d) => (d * Math.PI) / 180;
  const dLat = r(lat2 - lat1), dLon = r(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(a));
}

function fmt(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

const errText = (e) => e?.response?.data?.detail || e?.message || 'Something went wrong';

export default function ShiftTrackingPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [pos, setPos] = useState(null);       // {lat, lng, accuracy}
  const [geoErr, setGeoErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [remark, setRemark] = useState('');
  const [tick, setTick] = useState(0);
  const lastExitReport = useRef(0);
  const wasInside = useRef(true);

  const loading = data === null && loadErr === null;

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/shift-track/${token}`);
      setData(res.data);
      setLoadErr(null);
    } catch (e) {
      setLoadErr(errText(e));
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // live geolocation
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGeoErr('Geolocation is not supported on this device.');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
        setGeoErr(null);
      },
      (err) => setGeoErr(err.code === 1
        ? 'Location access denied. Enable location to clock in/out.'
        : 'Unable to get your location.'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // 1s ticker for countdowns
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const geo = data?.geofence;
  const configured = geo?.configured;
  const dist = (configured && pos)
    ? distanceM(pos.lat, pos.lng, geo.latitude, geo.longitude) : null;
  const inside = !configured ? true : (dist != null && dist <= geo.radius_m);

  // Auto-report geofence exit while clocked in
  useEffect(() => {
    if (!data || data.shift_status !== 'Clocked In' || !configured || dist == null) return;
    if (inside) { wasInside.current = true; return; }
    const now = Date.now();
    if (wasInside.current || now - lastExitReport.current > 60000) {
      wasInside.current = false;
      lastExitReport.current = now;
      api.post(`/shift-track/${token}/geofence-exit`, { latitude: pos.lat, longitude: pos.lng })
        .catch(() => {});
    }
  }, [inside, dist, data, configured, token, pos]);

  const act = async (path, body) => {
    setBusy(true);
    try {
      const { data: fresh } = await api.post(`/shift-track/${token}/${path}`, body || {});
      setData(fresh);
      return true;
    } catch (e) {
      toast.error(errText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const ping = () => ({ latitude: pos?.lat ?? null, longitude: pos?.lng ?? null });

  // Real-time presence: while clocked in, hold a WebSocket open so the Live
  // Tracking map shows the officer online instantly and flips them offline the
  // moment the connection drops (more reliable than a timed HTTP heartbeat,
  // which mobile browsers suspend when the tab is backgrounded).
  const posRef = useRef(null);
  useEffect(() => { posRef.current = pos; }, [pos]);
  useEffect(() => {
    if (!data || data.shift_status !== 'Clocked In') return;
    let ws = null;
    let hb = null;
    let closedByUs = false;
    let reconnect = null;

    const connect = () => {
      try {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${proto}//${window.location.host}/api/ws/shift/${token}`);
        ws.onopen = () => {
          const send = () => {
            const p = posRef.current;
            try { ws.send(JSON.stringify({ latitude: p?.lat ?? null, longitude: p?.lng ?? null })); } catch { /* noop */ }
          };
          send();
          hb = setInterval(send, 20000);
        };
        ws.onclose = () => {
          if (hb) clearInterval(hb);
          if (!closedByUs) reconnect = setTimeout(connect, 5000);
        };
        ws.onerror = () => { try { ws.close(); } catch { /* noop */ } };
      } catch { /* WS unavailable */ }
    };
    connect();

    return () => {
      closedByUs = true;
      if (hb) clearInterval(hb);
      if (reconnect) clearTimeout(reconnect);
      if (ws) {
        try {
          if (ws.readyState === WebSocket.CONNECTING) ws.onopen = () => ws.close();
          else ws.close();
        } catch { /* noop */ }
      }
    };
  }, [data?.shift_status, token]);

  if (loading) {
    return (
      <Shell>
        <div className="flex items-center gap-3 text-slate-300" data-testid="shift-loading">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading shift…
        </div>
      </Shell>
    );
  }
  if (loadErr) {
    return (
      <Shell>
        <div className="text-center" data-testid="shift-error">
          <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <p className="text-slate-200 text-lg font-medium">{loadErr}</p>
        </div>
      </Shell>
    );
  }
  if (data?.expired) {
    return (
      <Shell>
        <div className="text-center" data-testid="shift-expired">
          <Timer className="w-12 h-12 text-amber-400 mx-auto mb-3" />
          <p className="text-slate-200 text-lg font-medium">{data.message || 'This shift link has expired.'}</p>
        </div>
      </Shell>
    );
  }

  const status = data.shift_status;
  const t = data.tracking;
  const w = data.windows;
  const serverOffset = w.server_now ? new Date(w.server_now).getTime() - Date.now() : 0;
  const nowMs = Date.now() + serverOffset;

  const notStarted = status === 'Not Started';
  const clockedIn = status === 'Clocked In';
  const clockedOut = status === 'Clocked Out';
  const cancelled = status === 'Cancelled';

  const clockOutOpensMs = w.clock_out_opens_at ? new Date(w.clock_out_opens_at).getTime() : null;
  const clockOutVisible = clockedIn && (clockOutOpensMs == null || nowMs >= clockOutOpensMs);
  const clockInOpensMs = w.clock_in_opens_at ? new Date(w.clock_in_opens_at).getTime() : null;
  const clockInWindowOpen = clockInOpensMs == null || nowMs >= clockInOpensMs;
  const nextDueMs = t.next_check_in_due_at ? new Date(t.next_check_in_due_at).getTime() : null;
  const graceMs = (t.checkin_grace_minutes || 15) * 60000;
  const checkInOverdue = nextDueMs != null && nowMs > nextDueMs + graceMs;

  const statusColor = cancelled ? 'text-slate-400'
    : clockedOut ? 'text-emerald-400'
    : clockedIn ? 'text-sky-400' : 'text-amber-400';

  const relTime = (ms) => {
    if (ms == null) return '';
    const diff = Math.round((ms - nowMs) / 1000);
    const abs = Math.abs(diff);
    const h = Math.floor(abs / 3600), m = Math.floor((abs % 3600) / 60), s = abs % 60;
    const str = h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`;
    return diff >= 0 ? `in ${str}` : `${str} ago`;
  };

  return (
    <Shell>
      <div className="w-full max-w-lg" data-testid="shift-tracking-page">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-xs uppercase tracking-widest text-sky-400/80 font-semibold">OfficeFlow · Shift</p>
            <h1 className="text-2xl font-bold text-white mt-1">{data.officer?.name || 'Security Officer'}</h1>
            <p className="text-slate-400 text-sm flex items-center gap-1.5 mt-0.5">
              <Hash className="w-3.5 h-3.5" /> {data.officer?.code || '—'}
            </p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-semibold bg-white/5 border border-white/10 ${statusColor}`} data-testid="shift-status">
            {status}
          </span>
        </div>

        {/* Location / geofence status */}
        <div className={`rounded-xl border p-4 mb-4 ${inside ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`} data-testid="geofence-status">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Navigation className={`w-4 h-4 ${inside ? 'text-emerald-400' : 'text-red-400'}`} />
            {geoErr ? (
              <span className="text-red-300">{geoErr}</span>
            ) : !configured ? (
              <span className="text-slate-300">No geofence set for this post — location not enforced.</span>
            ) : inside ? (
              <span className="text-emerald-300">Inside geofence{dist != null ? ` (${Math.round(dist)} m from post)` : ''}</span>
            ) : (
              <span className="text-red-300">
                Outside geofence — {dist != null ? `${Math.round(dist)} m away` : 'locating…'} (must be within {geo.radius_m} m)
              </span>
            )}
          </div>
        </div>

        {/* Provider-aware mini map: post geofence + live position */}
        <ShiftMiniMap geo={geo} pos={pos} />

        {/* Shift details */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <Detail icon={MapPin} label="Location" value={data.location} sub={data.city} />
          <Detail icon={Hash} label="Post Pin" value={data.post_pin} sub={data.post_name} />
          <Detail icon={Clock} label="Start" value={`${data.date || ''} ${data.start_time || ''}`.trim()} />
          <Detail icon={Clock} label="End" value={data.end_time} />
          <Detail icon={Timer} label="Duty Hours" value={data.duty_hours != null ? `${data.duty_hours} h` : '—'} />
          <Detail icon={DollarSign} label="Duty Rate" value={data.duty_rate != null ? data.duty_rate : '—'} />
          <Detail icon={User} label="Social Security" value={data.officer?.ssn || '—'} />
          <Detail icon={ShieldAlert} label="Client" value={data.client_name || '—'} />
        </div>

        {/* Site instructions from the schedule */}
        {data.site_instruction && (
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 mb-5" data-testid="site-instruction">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-sky-300 font-semibold mb-1.5">
              <ShieldAlert className="w-3.5 h-3.5" /> Site Instructions
            </div>
            <p className="text-slate-200 text-sm whitespace-pre-wrap break-words">{data.site_instruction}</p>
          </div>
        )}

        {/* Live tracking state */}
        {(clockedIn || clockedOut) && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 mb-5 text-sm space-y-1.5" data-testid="tracking-state">
            <Row k="Clocked in at" v={fmt(t.clock_in_at)} />
            {clockedIn && (
              <Row
                k="Next check-in due"
                v={`${fmt(t.next_check_in_due_at)} · ${relTime(nextDueMs)}`}
                warn={checkInOverdue}
              />
            )}
            <Row k="Check-ins done" v={t.check_in_count} />
            {clockedOut && <Row k="Clocked out at" v={fmt(t.clock_out_at)} />}
            {t.emergency_clock_out && (
              <Row k="Emergency reason" v={t.emergency_clock_out.remark} warn />
            )}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          {notStarted && !cancelled && (
            <>
              <Btn
                testid="clock-in-btn"
                disabled={busy || !inside || (configured && !pos) || !clockInWindowOpen}
                onClick={() => act('clock-in', ping())}
                icon={LogIn}
                variant="primary"
              >
                {busy ? 'Working…' : 'Clock In'}
              </Btn>
              {!inside && configured && (
                <p className="text-xs text-red-300 text-center" data-testid="clock-in-blocked">
                  You must be inside the geofence to Clock In.
                </p>
              )}
              {inside && !clockInWindowOpen && clockInOpensMs && (
                <p className="text-xs text-slate-400 text-center" data-testid="clock-in-hint">
                  Clock In opens {relTime(clockInOpensMs)} (10 min before shift start).
                </p>
              )}
            </>
          )}

          {clockedIn && (
            <>
              <Btn
                testid="check-in-btn"
                disabled={busy || !inside}
                onClick={() => act('check-in', ping())}
                icon={CheckCircle2}
                variant={checkInOverdue ? 'warn' : 'primary'}
              >
                {checkInOverdue ? 'Check In (overdue!)' : 'Check In'}
              </Btn>

              {clockOutVisible && (
                <Btn
                  testid="clock-out-btn"
                  disabled={busy || !inside}
                  onClick={() => act('clock-out', ping())}
                  icon={LogOut}
                  variant="success"
                >
                  Clock Out
                </Btn>
              )}
              {!clockOutVisible && clockOutOpensMs && (
                <p className="text-xs text-slate-400 text-center" data-testid="clock-out-hint">
                  Clock Out opens {relTime(clockOutOpensMs)} (at shift end time).
                </p>
              )}

              {/* Emergency clock out — always visible after clock in */}
              {!emergencyOpen ? (
                <Btn
                  testid="emergency-open-btn"
                  onClick={() => setEmergencyOpen(true)}
                  icon={AlertTriangle}
                  variant="danger-soft"
                >
                  Emergency Clock Out
                </Btn>
              ) : (
                <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-3 space-y-2" data-testid="emergency-box">
                  <textarea
                    className="w-full rounded-lg bg-slate-900 border border-white/10 text-slate-100 text-sm p-2.5 outline-none focus:border-red-400"
                    rows={3}
                    placeholder="Reason for clocking out early…"
                    value={remark}
                    onChange={(e) => setRemark(e.target.value)}
                    data-testid="emergency-remark-input"
                  />
                  <div className="flex gap-2">
                    <Btn
                      testid="emergency-submit-btn"
                      disabled={busy || !remark.trim()}
                      onClick={async () => {
                        const ok = await act('emergency-clock-out', { ...ping(), remark });
                        if (ok) { setEmergencyOpen(false); setRemark(''); }
                      }}
                      variant="danger"
                      small
                    >
                      Confirm Emergency Clock Out
                    </Btn>
                    <button
                      className="px-4 py-2 rounded-lg text-sm text-slate-300 hover:text-white"
                      onClick={() => { setEmergencyOpen(false); setRemark(''); }}
                      data-testid="emergency-cancel-btn"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {(clockedOut || cancelled) && (
            <div className="text-center py-4" data-testid="shift-final">
              {cancelled
                ? <><XCircle className="w-10 h-10 text-slate-400 mx-auto mb-2" /><p className="text-slate-300">This shift was cancelled.</p></>
                : <><CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" /><p className="text-slate-300">Shift complete. Thank you!</p></>}
            </div>
          )}

        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4"
         style={{ backgroundImage: 'radial-gradient(circle at 20% 0%, rgba(56,189,248,0.08), transparent 40%)' }}>
      {children}
    </div>
  );
}

function Detail({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500 mb-1">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="text-slate-100 text-sm font-medium break-words">{value || '—'}</div>
      {sub && <div className="text-slate-500 text-xs mt-0.5">{sub}</div>}
    </div>
  );
}

function Row({ k, v, warn }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-400">{k}</span>
      <span className={`font-medium text-right ${warn ? 'text-amber-400' : 'text-slate-200'}`}>{v}</span>
    </div>
  );
}

function Btn({ children, onClick, disabled, icon: Icon, variant = 'primary', small, testid }) {
  const styles = {
    primary: 'bg-sky-500 hover:bg-sky-400 text-white',
    success: 'bg-emerald-500 hover:bg-emerald-400 text-white',
    warn: 'bg-amber-500 hover:bg-amber-400 text-slate-900',
    danger: 'bg-red-500 hover:bg-red-400 text-white',
    'danger-soft': 'bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/40',
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-testid={testid}
      className={`w-full flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors
        ${small ? 'py-2 text-sm' : 'py-3.5'} ${styles} disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {Icon && <Icon className="w-4 h-4" />} {children}
    </button>
  );
}
