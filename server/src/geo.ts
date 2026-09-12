const METERS_PER_DEG_LAT = 111_320;
const EARTH_RADIUS_M = 6_371_000;
const POLE_COS_EPS = 1e-6;

export type BoundingBox = {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
};

export function boundingBox(lat: number, lon: number, radiusM: number): BoundingBox {
  const latDelta = radiusM / METERS_PER_DEG_LAT;
  const cosLat = Math.cos((lat * Math.PI) / 180);

  let minLon: number;
  let maxLon: number;
  if (Math.abs(cosLat) < POLE_COS_EPS) {
    minLon = -180;
    maxLon = 180;
  } else {
    const lonDelta = radiusM / (METERS_PER_DEG_LAT * cosLat);
    minLon = Math.max(-180, lon - lonDelta);
    maxLon = Math.min(180, lon + lonDelta);
  }

  return {
    minLat: Math.max(-90, lat - latDelta),
    maxLat: Math.min(90, lat + latDelta),
    minLon,
    maxLon,
  };
}

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}
