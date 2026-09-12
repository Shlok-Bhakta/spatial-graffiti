import * as Location from 'expo-location';

export type GpsFix = {
  latitude: number;
  longitude: number;
  horizontalAccuracyM: number | null;
};

const ACCURACY_WAIT_MS = 8000;
const GOOD_ENOUGH_M = 25;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const first = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  let best = first;
  const started = Date.now();
  while (
    (best.coords.accuracy == null || best.coords.accuracy > GOOD_ENOUGH_M) &&
    Date.now() - started < ACCURACY_WAIT_MS
  ) {
    await sleep(1500);
    const next = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    if (
      next.coords.accuracy != null &&
      (best.coords.accuracy == null || next.coords.accuracy < best.coords.accuracy)
    ) {
      best = next;
    }
  }
  return {
    latitude: best.coords.latitude,
    longitude: best.coords.longitude,
    horizontalAccuracyM: best.coords.accuracy ?? null,
  };
}
