import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { getMapTile } from '@/lib/mapTiles';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

/** Read-only mini map for the officer shift page: geofence circle + live pin.
 *  Honours the system map provider (OpenStreetMap / Google Maps). */
export default function ShiftMiniMap({ geo, pos }) {
  const { settings } = useAppSettings();
  const el = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (mapRef.current || !el.current) return;
    const gc = geo && geo.lat != null && geo.lng != null ? [geo.lat, geo.lng] : null;
    const start = gc || (pos ? [pos.lat, pos.lng] : [23.8103, 90.4125]);
    const map = L.map(el.current, { scrollWheelZoom: false, attributionControl: false }).setView(start, gc || pos ? 15 : 11);
    const t = getMapTile(settings);
    L.tileLayer(t.url, { subdomains: t.subdomains, maxZoom: t.maxZoom }).addTo(map);
    if (gc && geo.radius_m) {
      L.circle(gc, { radius: Number(geo.radius_m), color: '#0EA5E9', fillOpacity: 0.08 }).addTo(map);
      L.marker(gc, { opacity: 0.6 }).addTo(map).bindTooltip('Post site');
    }
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 250);
    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live officer position pin.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pos) return;
    const ll = [pos.lat, pos.lng];
    const icon = L.divIcon({
      className: 'shift-officer-pin',
      html: '<div style="width:16px;height:16px;border-radius:50%;background:#22c55e;border:3px solid white;box-shadow:0 0 0 5px #22c55e44;"></div>',
      iconSize: [16, 16], iconAnchor: [8, 8],
    });
    if (!markerRef.current) markerRef.current = L.marker(ll, { icon }).addTo(map).bindTooltip('You');
    else markerRef.current.setLatLng(ll);
  }, [pos]);

  return <div ref={el} data-testid="shift-mini-map" className="w-full h-48 rounded-xl overflow-hidden border border-white/10 mb-4 z-0" />;
}
