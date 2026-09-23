import * as Location from 'expo-location';

export type GpsFix = {
  latitude: number;
  longitude: number;
  horizontalAccuracyM: number | null;
};

const GOOD_ENOUGH_M = 25;

async function within<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Location timed out')), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function requestForegroundLocation(): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.status === 'granted') {
    return true;
  }
  const next = await Location.requestForegroundPermissionsAsync();
  return next.status === 'granted';
}

export async function getUsefulLocation(): Promise<GpsFix> {
  const recent = await Location.getLastKnownPositionAsync({
    maxAge: 5 * 60_000,
    requiredAccuracy: 100,
  }).catch(() => null);
  if (recent?.coords.accuracy != null && recent.coords.accuracy <= GOOD_ENOUGH_M &&
      Date.now() - recent.timestamp < 30_000) {
    return {
      latitude: recent.coords.latitude,
      longitude: recent.coords.longitude,
      horizontalAccuracyM: recent.coords.accuracy,
    };
  }
  const current = await within(
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
    8000,
  ).catch(() => null);
  const best = current ?? recent;
  if (!best) throw new Error('Location is unavailable');
  return {
    latitude: best.coords.latitude,
    longitude: best.coords.longitude,
    horizontalAccuracyM: best.coords.accuracy ?? null,
  };
}
