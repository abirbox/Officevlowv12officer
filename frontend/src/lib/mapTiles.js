// Resolve the active map tile layer from system settings so every map in the
// app (Post Site picker, Live Tracking, etc.) honours the chosen provider.
//   - OpenStreetMap (default)
//   - Google Maps (used only when selected AND an API key is saved)
export function getMapTile(settings) {
  const provider = settings?.map_provider || 'osm';
  const key = settings?.google_maps_api_key;
  if (provider === 'google' && key) {
    return {
      provider: 'google',
      url: 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
      subdomains: ['0', '1', '2', '3'],
      attribution: '&copy; Google Maps',
      maxZoom: 20,
    };
  }
  return {
    provider: 'osm',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c'],
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  };
}
