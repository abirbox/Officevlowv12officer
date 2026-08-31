import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Loader2, MapPin } from 'lucide-react';

// Fix Leaflet's default marker icon paths (webpack breaks the relative URLs).
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const DEFAULT_CENTER = [23.8103, 90.4125]; // Dhaka — a sensible neutral default
const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));

/**
 * Interactive location picker.
 *  - Geocodes `address` (debounced, via OpenStreetMap Nominatim — no API key).
 *  - Draggable / click-to-place pin that writes back lat/lng via onChange.
 *  - Reacts to manual lat/lng edits by moving the preview pin.
 */
export default function LocationMapPicker({ address, lat, lng, radius, onChange }) {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const lastGeocoded = useRef(null);
  const abortRef = useRef(null);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const emit = useCallback((la, ln) => {
    onChangeRef.current?.({ lat: Number(la.toFixed(6)), lng: Number(ln.toFixed(6)) });
  }, []);

  const placeMarker = useCallback((la, ln, recenter = true) => {
    const map = mapRef.current;
    if (!map) return;
    if (!markerRef.current) {
      markerRef.current = L.marker([la, ln], { draggable: true }).addTo(map);
      markerRef.current.on('dragend', () => {
        const p = markerRef.current.getLatLng();
        emit(p.lat, p.lng);
      });
    } else {
      markerRef.current.setLatLng([la, ln]);
    }
    if (circleRef.current) circleRef.current.setLatLng([la, ln]);
    if (recenter) map.setView([la, ln], Math.max(map.getZoom(), 15));
  }, [emit]);

  // Init map once.
  useEffect(() => {
    if (mapRef.current || !mapEl.current) return;
    const start = num(lat) != null && num(lng) != null ? [num(lat), num(lng)] : DEFAULT_CENTER;
    const map = L.map(mapEl.current, { scrollWheelZoom: true }).setView(start, num(lat) != null ? 15 : 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    map.on('click', (e) => emit(e.latlng.lat, e.latlng.lng));
    mapRef.current = map;

    if (radius) {
      circleRef.current = L.circle(start, { radius: Number(radius), color: '#0EA5E9', fillOpacity: 0.08 }).addTo(map);
    }
    if (num(lat) != null && num(lng) != null) placeMarker(num(lat), num(lng), true);

    // If coordinates already exist (e.g. editing an existing site), record the
    // current address as "already geocoded" so the initial auto-geocode does
    // NOT overwrite a saved / hand-placed pin. Only later address edits search.
    if (num(lat) != null && num(lng) != null) {
      lastGeocoded.current = (address || '').trim();
    }

    // Dialog mounts the map with 0 size initially — fix after paint.
    setTimeout(() => map.invalidateSize(), 250);
    return () => { map.remove(); mapRef.current = null; markerRef.current = null; circleRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to manual lat/lng edits (move preview pin without recentering aggressively).
  useEffect(() => {
    const la = num(lat), ln = num(lng);
    if (la == null || ln == null || !mapRef.current) return;
    const cur = markerRef.current?.getLatLng();
    if (cur && Math.abs(cur.lat - la) < 1e-6 && Math.abs(cur.lng - ln) < 1e-6) return;
    placeMarker(la, ln, true);
  }, [lat, lng, placeMarker]);

  // Keep the geofence circle radius in sync.
  useEffect(() => {
    if (circleRef.current && radius) circleRef.current.setRadius(Number(radius));
  }, [radius]);

  const geocode = useCallback(async (q) => {
    const query = (q || '').trim();
    if (!query) return;
    setSearching(true);
    setNotFound(false);
    // Cancel any in-flight lookup so a slow older response can't land last.
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
        { headers: { Accept: 'application/json' }, signal: controller.signal },
      );
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const { lat: la, lon: ln } = data[0];
        placeMarker(Number(la), Number(ln), true);
        emit(Number(la), Number(ln));
      } else {
        setNotFound(true);
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
      setNotFound(true);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setSearching(false);
      }
    }
  }, [emit, placeMarker]);

  // Auto-geocode when the address changes (debounced). Skips if we already
  // geocoded this exact string so a manual pin-drag isn't overwritten.
  useEffect(() => {
    const q = (address || '').trim();
    if (!q || q === lastGeocoded.current) return;
    const t = setTimeout(() => {
      lastGeocoded.current = q;
      geocode(q);
    }, 900);
    return () => clearTimeout(t);
  }, [address, geocode]);

  const hasPin = num(lat) != null && num(lng) != null;

  return (
    <div className="space-y-2" data-testid="location-map-picker">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => geocode(address)}
          disabled={searching || !(address || '').trim()}
          data-testid="map-search-address"
        >
          {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          <span className="ml-1.5">Search address</span>
        </Button>
        <span className="text-xs text-[#64748B] dark:text-[#A1A1AA] flex items-center gap-1">
          <MapPin className="w-3 h-3" />
          {hasPin
            ? `Pinned: ${num(lat).toFixed(5)}, ${num(lng).toFixed(5)}`
            : 'Click the map or drag the pin to set the location'}
        </span>
      </div>
      {notFound && (
        <p className="text-xs text-amber-600 dark:text-amber-400" data-testid="map-not-found">
          Address not found automatically — drag the pin or type the coordinates manually.
        </p>
      )}
      <div
        ref={mapEl}
        data-testid="location-map"
        className="w-full h-64 rounded-lg overflow-hidden border border-[#E2E8F0] dark:border-[#27272A] z-0"
      />
    </div>
  );
}
