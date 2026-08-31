import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { motion } from 'framer-motion';
import { useScopedApi } from '@/lib/scopedApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/sonner';
import { MapPin, RefreshCw, Radio, Search, Shield, Hash, Clock, Building2, Link2, ExternalLink, Crosshair } from 'lucide-react';

// Fix default marker asset URLs (bundlers otherwise strip them).
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const SHIFT_COLORS = {
  Morning: '#f59e0b', Afternoon: '#0ea5e9', Evening: '#f97316', Night: '#6366f1',
};

const createOfficerIcon = (shiftType, highlighted, stale) => {
  const color = stale ? '#94a3b8' : (SHIFT_COLORS[shiftType] || '#22c55e');
  const size = highlighted ? 34 : 26;
  const ring = highlighted ? '4px solid #0EA5E9' : '3px solid white';
  const pulse = stale ? '' : `box-shadow:0 0 0 6px ${color}22;`;
  return L.divIcon({
    className: 'officer-live-marker',
    html: `<div style="background:${color};width:${size}px;height:${size}px;border-radius:50%;border:${ring};${pulse}display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:11px;">${shiftType ? shiftType.charAt(0) : 'S'}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

const MapFlyer = ({ target }) => {
  const map = useMap();
  useEffect(() => {
    if (target && Number.isFinite(target.lat) && Number.isFinite(target.lng)) {
      map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 16), { duration: 1.1 });
    }
  }, [target, map]);
  return null;
};

const fmt = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
};

const relAgo = (iso) => {
  if (!iso) return null;
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 0) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
};

const LiveTrackingPage = () => {
  const api = useScopedApi();
  const [officers, setOfficers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [flyTarget, setFlyTarget] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [liveConnected, setLiveConnected] = useState(false);
  const markerRefs = useRef({});
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);

  const fetchLive = async (silent = false) => {
    try {
      const { data } = await api.get('/dispatch/live-tracking');
      setOfficers(Array.isArray(data.officers) ? data.officers : []);
      setLastUpdated(new Date());
    } catch (e) {
      if (!silent) console.warn('Live tracking fetch failed:', e.response?.status);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchLive();
    // Safety-net poll (real-time updates arrive over the WebSocket below).
    const t = setInterval(() => fetchLive(true), 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real-time push: apply per-officer updates instantly instead of waiting for
  // the poll. Upserts a moved/checked-in officer; removes one who clocked out.
  useEffect(() => {
    let closedByUs = false;

    const applyUpdate = (msg) => {
      const sid = msg.schedule_id;
      if (!sid) return;
      setOfficers((prev) => {
        if (msg.removed) return prev.filter((o) => o.schedule_id !== sid);
        const next = prev.filter((o) => o.schedule_id !== sid);
        if (msg.officer) next.push(msg.officer);
        return next;
      });
      setLastUpdated(new Date());
    };

    const connect = () => {
      try {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${proto}//${window.location.host}/api/ws/dispatch`);
        wsRef.current = ws;
        ws.onopen = () => setLiveConnected(true);
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'dispatch_live_update') applyUpdate(msg);
          } catch { /* ignore malformed */ }
        };
        ws.onclose = () => {
          setLiveConnected(false);
          if (!closedByUs) reconnectRef.current = setTimeout(connect, 8000);
        };
        ws.onerror = () => { try { ws.close(); } catch { /* noop */ } };
      } catch { /* WS unavailable — the 30s poll keeps the map fresh */ }
    };

    connect();
    return () => {
      closedByUs = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) { try { wsRef.current.close(); } catch { /* noop */ } }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const withPosition = useMemo(() => officers.filter((o) => o.position), [officers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return officers;
    return officers.filter((o) =>
      (o.officer_name || '').toLowerCase().includes(q) ||
      (o.post_pin || '').toLowerCase().includes(q) ||
      (o.post_name || '').toLowerCase().includes(q) ||
      (o.client_name || '').toLowerCase().includes(q)
    );
  }, [officers, query]);

  const defaultCenter = withPosition.length > 0
    ? [withPosition[0].position.lat, withPosition[0].position.lng]
    : [23.8103, 90.4125]; // Dhaka fallback

  const focus = (o) => {
    setSelectedId(o.schedule_id);
    if (o.position) {
      setFlyTarget({ lat: o.position.lat, lng: o.position.lng, ts: Date.now() });
      setTimeout(() => {
        const m = markerRefs.current[o.schedule_id];
        if (m && m.openPopup) m.openPopup();
      }, 850);
    }
  };

  const copyLink = async (o) => {
    if (!o.tracking_url) { toast.error('No tracking link for this shift'); return; }
    try {
      await navigator.clipboard.writeText(o.tracking_url);
      toast.success('Shift tracking link copied');
    } catch { window.prompt('Copy this shift tracking link:', o.tracking_url); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="live-tracking-loading">
        <div className="w-8 h-8 border-4 border-[#0EA5E9] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div data-testid="live-tracking-page">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#0F172A] dark:text-[#FAFAFA] tracking-tight mb-1">
            Live Tracking
          </h1>
          <p className="text-[#64748B] dark:text-[#A1A1AA] flex items-center gap-2 text-sm">
            <Radio className={`w-4 h-4 ${liveConnected ? 'text-green-500 animate-pulse' : 'text-amber-500'}`} />
            {liveConnected ? 'Live · real-time updates' : 'Reconnecting… (auto-refresh every 30s)'} · {officers.length} officer{officers.length === 1 ? '' : 's'} clocked in · {withPosition.length} on map
            {lastUpdated && <span className="text-[#94A3B8]">· updated {lastUpdated.toLocaleTimeString()}</span>}
          </p>
        </div>
        <Button onClick={() => fetchLive()} variant="outline" data-testid="live-tracking-refresh">
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-3 border-[#E2E8F0] dark:border-[#27272A] overflow-hidden">
          <CardContent className="p-0">
            <div style={{ height: '620px', width: '100%' }} data-testid="live-tracking-map">
              <MapContainer center={defaultCenter} zoom={12} style={{ height: '100%', width: '100%' }}>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapFlyer target={flyTarget} />
                {withPosition.map((o) => {
                  const stale = o.position_source === 'geofence';
                  return (
                    <Marker
                      key={o.schedule_id}
                      ref={(el) => { if (el) markerRefs.current[o.schedule_id] = el; }}
                      position={[o.position.lat, o.position.lng]}
                      icon={createOfficerIcon(o.shift_type, selectedId === o.schedule_id, stale)}
                      eventHandlers={{ click: () => setSelectedId(o.schedule_id) }}
                    >
                      {o.geofence?.configured && (
                        <Circle
                          center={[o.geofence.lat, o.geofence.lng]}
                          radius={o.geofence.radius_m}
                          pathOptions={{ color: '#0EA5E9', fillColor: '#0EA5E9', fillOpacity: 0.06, weight: 1.2, dashArray: '4 4' }}
                        />
                      )}
                      <Popup>
                        <div className="p-1 min-w-[200px]" data-testid={`live-popup-${o.schedule_id}`}>
                          <p className="font-semibold text-[#0F172A] flex items-center gap-1.5">
                            <Shield className="w-4 h-4 text-[#0EA5E9]" /> {o.officer_name || 'Officer'}
                          </p>
                          {o.officer_code && <p className="text-xs text-gray-500">{o.officer_code}</p>}
                          <div className="mt-2 space-y-1 text-xs text-gray-700">
                            <p className="flex items-center gap-1"><Hash className="w-3 h-3" /> Post: <span className="font-medium">{o.post_pin || '—'}</span> {o.post_name ? `· ${o.post_name}` : ''}</p>
                            <p className="flex items-center gap-1"><Building2 className="w-3 h-3" /> {o.client_name || '—'}{o.city ? ` · ${o.city}` : ''}</p>
                            <p className="flex items-center gap-1"><Clock className="w-3 h-3" /> {o.shift_type} · {o.start_time}–{o.end_time}</p>
                            <p>Clocked in: {fmt(o.clock_in_at)}</p>
                            <p>Check-ins: {o.check_in_count} · last {relAgo(o.last_check_in_at) || '—'}</p>
                            {stale && <p className="text-amber-600">Showing post location (no live GPS ping yet)</p>}
                          </div>
                          {o.tracking_url && (
                            <a href={o.tracking_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[#0EA5E9] text-xs font-medium hover:underline">
                              <ExternalLink className="w-3 h-3" /> Open shift page
                            </a>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E2E8F0] dark:border-[#27272A]">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="w-5 h-5" /> On Duty
            </CardTitle>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search officer, post, client…"
                className="pl-9 h-9"
                data-testid="live-tracking-search"
              />
            </div>
          </CardHeader>
          <CardContent className="p-3">
            <div className="space-y-2 max-h-[520px] overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-sm text-[#64748B] p-4 text-center" data-testid="live-tracking-empty">
                  {officers.length === 0 ? 'No officers are clocked in right now' : 'No matches — try another search'}
                </p>
              ) : (
                filtered.map((o) => {
                  const stale = o.position_source === 'geofence';
                  return (
                    <motion.div
                      key={o.schedule_id}
                      whileHover={{ scale: 1.02 }}
                      onClick={() => focus(o)}
                      className={`p-3 rounded-lg cursor-pointer border ${selectedId === o.schedule_id ? 'bg-[#0EA5E9]/10 border-[#0EA5E9]' : 'bg-[#F8FAFC] dark:bg-[#27272A] border-transparent'}`}
                      data-testid={`live-officer-${o.schedule_id}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: SHIFT_COLORS[o.shift_type] || '#22c55e' }}>
                          {(o.officer_name || 'S').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate text-[#0F172A] dark:text-[#FAFAFA]">{o.officer_name || 'Officer'}</p>
                          <p className="text-xs text-[#64748B] truncate">Post {o.post_pin || '—'} · {o.client_name || '—'}</p>
                        </div>
                        <Badge className="text-xs bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400">
                          {o.shift_type || 'Shift'}
                        </Badge>
                      </div>
                      <p className="text-xs text-[#64748B] mt-1">{o.start_time}–{o.end_time} · {o.check_in_count} check-in{o.check_in_count === 1 ? '' : 's'}</p>
                      {o.position ? (
                        <p className={`text-xs flex items-center gap-1 mt-1 font-medium ${stale ? 'text-[#94A3B8]' : 'text-[#0EA5E9]'}`}>
                          <Crosshair className="w-3 h-3" />
                          {o.position.lat.toFixed(4)}, {o.position.lng.toFixed(4)} {stale ? '(post)' : ''}
                        </p>
                      ) : (
                        <p className="text-xs text-[#64748B] flex items-center gap-1 mt-1">
                          <MapPin className="w-3 h-3" /> No location yet
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); copyLink(o); }}
                          className="inline-flex items-center gap-1 text-[11px] text-[#0EA5E9] hover:underline"
                          data-testid={`live-copy-${o.schedule_id}`}
                        >
                          <Link2 className="w-3 h-3" /> Copy link
                        </button>
                        {o.tracking_url && (
                          <a
                            href={o.tracking_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-[11px] text-[#0EA5E9] hover:underline"
                            data-testid={`live-open-${o.schedule_id}`}
                          >
                            <ExternalLink className="w-3 h-3" /> Open
                          </a>
                        )}
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LiveTrackingPage;
