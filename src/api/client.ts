import { File, Paths } from 'expo-file-system';

import type { NearbySite, Site, Stroke, WorldMapVersion } from '@/types';

export function apiBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';
  return raw.replace(/\/$/, '');
}

export function apiUrl(path: string): string {
  const base = apiBaseUrl();
  if (!base) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is not set');
  }
  return `${base}${path}`;
}

export function apiHostLabel(baseUrl = apiBaseUrl()): string {
  if (!baseUrl) {
    return 'API unset';
  }
  return baseUrl.replace(/^https?:\/\//, '');
}

async function readJson<T>(response: Response, label: string): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${label} failed ${response.status}: ${body.slice(0, 400)}`);
  }
  return (await response.json()) as T;
}

async function fetchTimed(url: string, init?: RequestInit, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function getHealth(timeoutMs = 4000): Promise<{ ok: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(apiUrl('/health'), { signal: controller.signal });
    return await readJson(response, 'health');
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`health timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function getNearbySites(
  latitude: number,
  longitude: number,
  radiusM = 100,
): Promise<NearbySite[]> {
  const query = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    radiusM: String(radiusM),
  });
  const response = await fetchTimed(apiUrl(`/v1/sites/nearby?${query}`));
  const payload = await readJson<{ sites: NearbySite[] }>(response, 'nearby sites');
  return payload.sites;
}

export async function createSite(site: Site): Promise<Site> {
  const response = await fetchTimed(apiUrl('/v1/sites'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(site),
  });
  return readJson<Site>(response, 'create site');
}

export async function uploadWorldMap(siteId: string, fileUri: string): Promise<void> {
  const file = new File(fileUri);
  const result = await file.upload(apiUrl(`/v1/sites/${siteId}/world-map`), {
    httpMethod: 'PUT',
    sessionType: 'foreground',
    headers: { 'Content-Type': 'application/octet-stream' },
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`world map upload failed ${result.status}: ${result.body.slice(0, 400)}`);
  }
}

export async function downloadWorldMap(siteId: string): Promise<string> {
  // Keep the last successful on-phone map intact while fetching a newer one.
  const dest = new File(Paths.document, `${siteId}.${Date.now()}.worldmap`);
  const downloaded = await File.downloadFileAsync(
    apiUrl(`/v1/sites/${siteId}/world-map`),
    dest,
    { idempotent: true },
  );
  return downloaded.uri;
}

export async function getWorldMapHistory(siteId: string): Promise<WorldMapVersion[]> {
  const response = await fetchTimed(apiUrl(`/v1/sites/${siteId}/world-map/history`));
  const payload = await readJson<{ history: WorldMapVersion[] }>(
    response,
    'world map history',
  );
  return payload.history;
}

export async function downloadWorldMapVersion(
  siteId: string,
  sha256: string,
): Promise<string> {
  const dest = new File(Paths.document, `${siteId}.${sha256.slice(0, 12)}.worldmap`);
  const downloaded = await File.downloadFileAsync(
    apiUrl(`/v1/sites/${siteId}/world-map/history/${sha256}`),
    dest,
    { idempotent: true },
  );
  return downloaded.uri;
}

export async function uploadSnapshot(siteId: string, jpegFileUri: string): Promise<void> {
  const file = new File(jpegFileUri);
  const result = await file.upload(apiUrl(`/v1/sites/${siteId}/snapshot`), {
    httpMethod: 'PUT',
    sessionType: 'foreground',
    headers: { 'Content-Type': 'image/jpeg' },
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`snapshot upload failed ${result.status}: ${result.body.slice(0, 400)}`);
  }
}

export async function getStrokes(siteId: string): Promise<Stroke[]> {
  const response = await fetchTimed(apiUrl(`/v1/sites/${siteId}/strokes`));
  const payload = await readJson<{ strokes: Stroke[] }>(response, 'strokes');
  return payload.strokes;
}

export async function createStroke(siteId: string, stroke: Stroke): Promise<void> {
  const response = await fetchTimed(apiUrl(`/v1/sites/${siteId}/strokes`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: stroke.id,
      color: stroke.color,
      widthM: stroke.widthM,
      points: stroke.points,
      createdAt: stroke.createdAt,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`create stroke failed ${response.status}: ${body.slice(0, 400)}`);
  }
}

export type FeaturePrint = { id: string; data: string };

export async function getFeaturePrints(siteId: string): Promise<FeaturePrint[]> {
  const response = await fetchTimed(apiUrl(`/v1/sites/${siteId}/feature-prints`));
  const payload = await readJson<{ featurePrints: FeaturePrint[] }>(response, 'feature prints');
  return payload.featurePrints;
}

export async function createFeaturePrint(siteId: string, featurePrint: FeaturePrint): Promise<void> {
  const response = await fetchTimed(apiUrl(`/v1/sites/${siteId}/feature-prints`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(featurePrint),
  });
  await readJson<{ ok: boolean }>(response, 'save feature print');
}
