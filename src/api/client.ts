import { File, Paths } from 'expo-file-system';

import type { NearbySite, Site, Stroke } from '@/types';

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

async function readJson<T>(response: Response, label: string): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${label} failed ${response.status}: ${body.slice(0, 400)}`);
  }
  return (await response.json()) as T;
}

export async function getHealth(): Promise<{ ok: boolean }> {
  const response = await fetch(apiUrl('/health'));
  return readJson(response, 'health');
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
  const response = await fetch(apiUrl(`/v1/sites/nearby?${query}`));
  const payload = await readJson<{ sites: NearbySite[] }>(response, 'nearby sites');
  return payload.sites;
}

export async function createSite(site: Site): Promise<Site> {
  const response = await fetch(apiUrl('/v1/sites'), {
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
  const dest = new File(Paths.document, `${siteId}.worldmap`);
  const downloaded = await File.downloadFileAsync(
    apiUrl(`/v1/sites/${siteId}/world-map`),
    dest,
    { idempotent: true },
  );
  return downloaded.uri;
}

export async function getStrokes(siteId: string): Promise<Stroke[]> {
  const response = await fetch(apiUrl(`/v1/sites/${siteId}/strokes`));
  const payload = await readJson<{ strokes: Stroke[] }>(response, 'strokes');
  return payload.strokes;
}

export async function createStroke(siteId: string, stroke: Stroke): Promise<void> {
  const response = await fetch(apiUrl(`/v1/sites/${siteId}/strokes`), {
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
  const response = await fetch(apiUrl(`/v1/sites/${siteId}/feature-prints`));
  const payload = await readJson<{ featurePrints: FeaturePrint[] }>(response, 'feature prints');
  return payload.featurePrints;
}

export async function createFeaturePrint(siteId: string, featurePrint: FeaturePrint): Promise<void> {
  const response = await fetch(apiUrl(`/v1/sites/${siteId}/feature-prints`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(featurePrint),
  });
  await readJson<{ ok: boolean }>(response, 'save feature print');
}
