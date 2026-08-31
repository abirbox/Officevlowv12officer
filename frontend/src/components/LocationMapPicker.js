import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Input } from '@/components/ui/input';
import { Search, Loader2, MapPin } from 'lucide-react';
import { api } from '@/lib/axios';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { getMapTile } from '@/lib/mapTiles';

// Fix Leaflet's default marker icon paths (webpack breaks the relative URLs).
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const DEFAULT_CENTER = [23.8103, 90.4125]; // Dhaka — a neutral default
const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));

// --- Google Maps JS (Places) loader — only used when Google is configured. ---
let googleLoader = null;
function loadGoogle(key) {
  if (window.google?.maps?.places) return Promise.resolve();
  if (!googleLoader) {
    googleLoader = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places`;
      s.async = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  return googleLoader;
}

/**
 * Post-site location picker.
 *  - Autocomplete suggestions as you type (Google Places when Google Maps is
 *    the configured provider + a key exists, otherwise OpenStreetMap/Nominatim).
 *  - Draggable / click-to-place pin; writes lat/lng via onChange.
 *  - Always draws the geofence radius as a circle around the pin, reflecting
 *    the Geofence Radius field.
 */
export default function LocationMapPicker({ address, onAddressChange, lat, lng, radius, onChange }) {
  const { settings } = useAppSettings();
  const tile = getMapTile(settings);
  const useGoogle = tile.provider === 'google';
  const googleKey = settings?.google_maps_api_key;

  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const radiusRef = useRef(radius);
  radiusRef.current = radius;

  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const acServiceRef = useRef(null);
  const debounceRef = useRef(null);
  const blurTimer = useRef(null);
  const reqIdRef = useRef(0);

  const emit = useCallback((la, ln) => {
    onChangeRef.current?.({ lat: Number(la.toFixed(6)), lng: Number(ln.toFixed(6)) });
  }, []);

  const drawCircle = useCallback((la, ln) => {
    const map = mapRef.current;
    if (!map) return;
    const r = Number(radiusRef.current) || 150;
    if (!circleRef.current) {
      circleRef.current = L.circle([la, ln], {
        radius: r, color: '#0EA5E9', weight: 2, fillColor: '#0EA5E9', fillOpacity: 0.1,
      }).addTo(map);
    } else {
      circleRef.current.setLatLng([la, ln]);
      circleRef.current.setRadius(r);
    }
  }, []);

  const placeMarker = useCallback((la, ln, recenter = true) => {
    const map = mapRef.current;
    if (!map) return;
    if (!markerRef.current) {
      markerRef.current = L.marker([la, ln], { draggable: true }).addTo(map);
      markerRef.current.on('dragend', () => {
        const p = markerRef.current.getLatLng();
        drawCircle(p.lat, p.lng);
        emit(p.lat, p.lng);
      });
    } else {
      markerRef.current.setLatLng([la, ln]);
    }
    drawCircle(la, ln);
    if (recenter) map.setView([la, ln], Math.max(map.getZoom(), 15));
  }, [emit, drawCircle]);

  // Init map once.
  useEffect(() => {
    if (mapRef.current || !mapEl.current) return;
    const start = num(lat) != null && num(lng) != null ? [num(lat), num(lng)] : DEFAULT_CENTER;
    const map = L.map(mapEl.current, { scrollWheelZoom: true }).setView(start, num(lat) != null ? 15 : 11);
    L.tileLayer(tile.url, { attribution: tile.attribution, subdomains: tile.subdomains, maxZoom: tile.maxZoom }).addTo(map);
    map.on('click', (e) => emit(e.latlng.lat, e.latlng.lng));
    mapRef.current = map;
    if (num(lat) != null && num(lng) != null) placeMarker(num(lat), num(lng), true);
    setTimeout(() => map.invalidateSize(), 250);
    return () => { map.remove(); mapRef.current = null; markerRef.current = null; circleRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to manual lat/lng edits (move pin + circle).
  useEffect(() => {
    const la = num(lat), ln = num(lng);
    if (la == null || ln == null || !mapRef.current) return;
    const cur = markerRef.current?.getLatLng();
    if (cur && Math.abs(cur.lat - la) < 1e-6 && Math.abs(cur.lng - ln) < 1e-6) return;
    placeMarker(la, ln, true);
  }, [lat, lng, placeMarker]);

  // Keep the geofence circle radius in sync with the radius field.
  useEffect(() => {
    if (circleRef.current) circleRef.current.setRadius(Number(radius) || 150);
  }, [radius]);

  // ---- Autocomplete ----
  const runOsmSuggest = useCallback(async (q) => {
    // Proxied through the backend (proper User-Agent + caching) so the browser
    // never hits Nominatim's anonymous rate limits directly.
    const { data } = await api.get('/geo/autocomplete', { params: { q } });
    return (data?.suggestions || []).map((d) => ({ label: d.label, lat: d.lat, lng: d.lng }));
  }, []);

  const runGoogleSuggest = useCallback(async (q) => {
    await loadGoogle(googleKey);
    if (!acServiceRef.current) acServiceRef.current = new window.google.maps.places.AutocompleteService();
    return new Promise((resolve) => {
      acServiceRef.current.getPlacePredictions({ input: q }, (preds, status) => {
        if (status !== window.google.maps.places.PlacesServiceStatus.OK || !preds) return resolve([]);
        resolve(preds.map((p) => ({ label: p.description, placeId: p.place_id })));
      });
    });
  }, [googleKey]);

  const fetchSuggestions = useCallback(async (q) => {
    const query = (q || '').trim();
    if (query.length < 3) { setSuggestions([]); return; }
    const reqId = ++reqIdRef.current;
    setSearching(true);
    setNotFound(false);
    try {
      const list = useGoogle && googleKey ? await runGoogleSuggest(query) : await runOsmSuggest(query);
      if (reqId !== reqIdRef.current) return; // a newer query superseded this one
      setSuggestions(list);
      setOpen(true);
      if (list.length === 0) setNotFound(true);
    } catch {
      if (reqId !== reqIdRef.current) return;
      setSuggestions([]);
      setNotFound(true);
    } finally {
      if (reqId === reqIdRef.current) setSearching(false);
    }
  }, [useGoogle, googleKey, runGoogleSuggest, runOsmSuggest]);

  const onType = (v) => {
    onAddressChange?.(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 350);
  };

  const resolveGooglePlace = (placeId) => new Promise((resolve) => {
    const svc = new window.google.maps.places.PlacesService(document.createElement('div'));
    svc.getDetails({ placeId, fields: ['geometry', 'formatted_address'] }, (place, status) => {
      if (status === window.google.maps.places.PlacesServiceStatus.OK && place?.geometry?.location) {
        resolve({ lat: place.geometry.location.lat(), lng: place.geometry.location.lng() });
      } else resolve(null);
    });
  });

  const selectSuggestion = async (sug) => {
    setOpen(false);
    onAddressChange?.(sug.label);
    let coords = sug.lat != null ? { lat: sug.lat, lng: sug.lng } : null;
    if (!coords && sug.placeId) coords = await resolveGooglePlace(sug.placeId);
    if (coords) {
      placeMarker(coords.lat, coords.lng, true);
      emit(coords.lat, coords.lng);
    }
  };

  const hasPin = num(lat) != null && num(lng) != null;

  return (
    <div className="space-y-2" data-testid="location-map-picker">
      <div className="relative">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <Input
            value={address || ''}
            onChange={(e) => onType(e.target.value)}
            onFocus={() => { if (suggestions.length) setOpen(true); }}
            onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 180); }}
            placeholder="Search an address…"
            className="pl-9 pr-9"
            data-testid="field-location"
            autoComplete="off"
          />
          {searching && <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[#94A3B8]" />}
        </div>
        {open && suggestions.length > 0 && (
          <ul
            className="absolute z-[1000] mt-1 w-full max-h-56 overflow-auto rounded-lg border border-[#E2E8F0] dark:border-[#27272A] bg-white dark:bg-[#18181B] shadow-lg"
            data-testid="location-suggestions"
            onMouseDown={() => { if (blurTimer.current) clearTimeout(blurTimer.current); }}
          >
            {suggestions.map((sug, i) => (
              <li key={sug.placeId || `${sug.lat},${sug.lng}` || i}>
                <button
                  type="button"
                  onClick={() => selectSuggestion(sug)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-[#F1F5F9] dark:hover:bg-[#27272A] flex items-start gap-2"
                  data-testid={`location-suggestion-${i}`}
                >
                  <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#0EA5E9]" />
                  <span className="break-words">{sug.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-1 text-xs text-[#64748B] dark:text-[#A1A1AA]">
        <MapPin className="w-3 h-3" />
        {hasPin
          ? `Pinned: ${num(lat).toFixed(5)}, ${num(lng).toFixed(5)} · geofence ${Number(radius) || 150} m`
          : 'Pick a suggestion, click the map, or drag the pin to set the location'}
      </div>
      {notFound && (
        <p className="text-xs text-amber-600 dark:text-amber-400" data-testid="map-not-found">
          No matches found — drag the pin or type coordinates manually.
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
