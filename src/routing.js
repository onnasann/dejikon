// Public demo server; use a dedicated routing service for production traffic.
export const ROUTING_ENDPOINT = 'https://valhalla1.openstreetmap.de/route';
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000;

export async function fetchWalkingRoute(start, end, { signal, fetchImpl = fetch } = {}) {
  const validPosition = p => Array.isArray(p) && p.length === 2 &&
    p.every(Number.isFinite) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180;
  if (!validPosition(start) || !validPosition(end)) throw new Error('Invalid coordinates');
  signal?.throwIfAborted();
  const key = JSON.stringify([start, end]);
  const cached = cache.get(key);
  if (fetchImpl === fetch && cached && Date.now() - cached.time < CACHE_TTL) return cached.route;
  const url = new URL(ROUTING_ENDPOINT);
  url.searchParams.set('json', JSON.stringify({
    locations: [start, end].map(([lat, lon]) => ({ lat, lon })),
    costing: 'pedestrian', format: 'osrm', shape_format: 'geojson',
    units: 'kilometers', language: 'ja-JP',
  }));
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 15000);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Routing HTTP ${response.status}`);
    const payload = await response.json();
    const result = payload.routes?.[0];
    const coordinates = result?.geometry?.coordinates;
    if (result?.geometry?.type !== 'LineString' || !Array.isArray(coordinates) ||
      coordinates.length < 2 || !coordinates.every(p => Array.isArray(p) && validPosition([p[1], p[0]])) ||
      !Number.isFinite(result.distance) || result.distance < 0 ||
      !Number.isFinite(result.duration) || result.duration < 0) {
      throw new Error('No valid walking route returned');
    }
    controller.signal.throwIfAborted();
    const route = {
      // GeoJSON is longitude/latitude; Leaflet expects latitude/longitude.
      positions: coordinates.map(([lon, lat]) => [lat, lon]),
      distance: result.distance, duration: result.duration,
    };
    if (fetchImpl === fetch) {
      if (cache.size >= 50) cache.delete(cache.keys().next().value);
      cache.set(key, { time: Date.now(), route });
    }
    return route;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
