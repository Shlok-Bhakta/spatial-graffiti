import { createHash } from "node:crypto";

import type { AppDb, NearbyRow, SiteRow, StrokeRow } from "./db";
import { boundingBox, haversineM } from "./geo";

const MAX_JSON_BYTES = 1 * 1024 * 1024;
const MAX_WORLD_MAP_BYTES = 32 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 512 * 1024;
const MAX_NEARBY = 10;
const MAX_STROKE_POINTS = 2048;
const MIN_WIDTH_M = 0.001;
const MAX_WIDTH_M = 0.1;
const DEFAULT_RADIUS_M = 100;
const MAX_RADIUS_M = 500;
const COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const MAX_FEATURE_PRINT_BYTES = 64 * 1024;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function createApp(db: AppDb) {
  return async (req: Request): Promise<Response> => {
    const started = Date.now();
    const path = new URL(req.url).pathname;
    let response: Response;
    try {
      response = await route(req, db);
    } catch (err) {
      if (err instanceof HttpError) {
        response = json(err.status, { error: err.message });
      } else {
        console.error(err);
        response = json(500, { error: "internal error" });
      }
    }
    if (!(req.method === "GET" && normalizePath(path) === "/health")) {
      console.log(`${req.method} ${normalizePath(path)} ${response.status} ${Date.now() - started}ms`);
    }
    return response;
  };
}

async function route(req: Request, db: AppDb): Promise<Response> {
  const url = new URL(req.url);
  const path = normalizePath(url.pathname);
  const method = req.method;

  if (method === "GET" && path === "/health") {
    return json(200, { ok: true });
  }

  if (method === "GET" && path === "/v1/sites/nearby") {
    return nearby(url, db);
  }

  if (method === "POST" && path === "/v1/sites") {
    return createSite(req, db);
  }

  const worldMapId = matchSegment(path, "/v1/sites/", "/world-map");
  if (worldMapId) {
    if (method === "PUT") {
      return putWorldMap(req, db, worldMapId);
    }
    if (method === "GET") {
      return getWorldMap(db, worldMapId);
    }
  }

  const historyListId = matchSegment(path, "/v1/sites/", "/world-map/history");
  if (historyListId && method === "GET") {
    return listWorldMapHistory(db, historyListId);
  }

  const historyBlob = matchHistoryBlob(path);
  if (historyBlob && method === "GET") {
    return getHistoryWorldMap(db, historyBlob.siteId, historyBlob.sha256);
  }

  const snapshotId = matchSegment(path, "/v1/sites/", "/snapshot");
  if (snapshotId) {
    if (method === "PUT") {
      return putSnapshot(req, db, snapshotId);
    }
    if (method === "GET") {
      return getSnapshot(db, snapshotId);
    }
  }

  const strokesId = matchSegment(path, "/v1/sites/", "/strokes");
  if (strokesId) {
    if (method === "GET") {
      return listStrokes(db, strokesId);
    }
    if (method === "POST") {
      return createStroke(req, db, strokesId);
    }
  }

  const featurePrintSiteId = matchSegment(path, "/v1/sites/", "/feature-prints");
  if (featurePrintSiteId) {
    if (method === "GET") {
      if (!db.findSite(featurePrintSiteId)) throw new HttpError(404, "site not found");
      return json(200, {
        featurePrints: db.listFeaturePrints(featurePrintSiteId).map((row) => ({
          id: row.id,
          data: Buffer.from(row.data).toString("base64"),
        })),
      });
    }
    if (method === "POST") {
      if (!db.findSite(featurePrintSiteId)) throw new HttpError(404, "site not found");
      const body = await readJson(req);
      if (!isRecord(body) || typeof body.id !== "string" || body.id.length > 100 || body.id.length === 0 ||
          typeof body.data !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.data)) {
        throw new HttpError(400, "invalid feature print");
      }
      const bytes = Buffer.from(body.data, "base64");
      if (bytes.length < 64 || bytes.length > MAX_FEATURE_PRINT_BYTES || bytes.toString("base64") !== body.data) {
        throw new HttpError(400, "invalid feature print");
      }
      db.insertFeaturePrint(featurePrintSiteId, body.id, bytes, new Date().toISOString());
      return json(200, { ok: true });
    }
  }

  return json(404, { error: "not found" });
}

function nearby(url: URL, db: AppDb): Response {
  const lat = parseQueryNumber(url.searchParams.get("lat"));
  const lon = parseQueryNumber(url.searchParams.get("lon"));
  const radiusRaw = url.searchParams.get("radiusM");
  const radiusM =
    radiusRaw == null || radiusRaw === "" ? DEFAULT_RADIUS_M : Number(radiusRaw);

  if (lat == null || lat < -90 || lat > 90) {
    throw new HttpError(400, "invalid latitude");
  }
  if (lon == null || lon < -180 || lon > 180) {
    throw new HttpError(400, "invalid longitude");
  }
  if (!Number.isFinite(radiusM) || radiusM <= 0 || radiusM > MAX_RADIUS_M) {
    throw new HttpError(400, "invalid radiusM");
  }

  const box = boundingBox(lat, lon, radiusM);
  const rows = db.findNearby(box.minLat, box.maxLat, box.minLon, box.maxLon);
  const sites = rows
    .map((row) => toNearbySite(row, lat, lon))
    .filter((site) => site.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, MAX_NEARBY);

  return json(200, { sites });
}

async function createSite(req: Request, db: AppDb): Promise<Response> {
  const body = await readJson(req);
  const site = parseSiteBody(body);
  const existing = db.findSite(site.id);
  if (existing) {
    return json(200, toSite(existing));
  }
  db.insertSite({
    id: site.id,
    latitude: site.latitude,
    longitude: site.longitude,
    horizontalAccuracyM: site.horizontalAccuracyM,
    createdAt: site.createdAt,
    updatedAt: site.createdAt,
  });
  return json(200, site);
}

async function putWorldMap(req: Request, db: AppDb, siteId: string): Promise<Response> {
  if (!db.findSite(siteId)) {
    throw new HttpError(404, "site not found");
  }
  rejectIfTooLarge(req, MAX_WORLD_MAP_BYTES, "world map too large");
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength > MAX_WORLD_MAP_BYTES) {
    throw new HttpError(413, "world map too large");
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  db.setWorldMap(siteId, bytes, sha256, bytes.byteLength, new Date().toISOString());
  return new Response(null, { status: 204 });
}

function getWorldMap(db: AppDb, siteId: string): Response {
  const bytes = db.getWorldMap(siteId);
  if (!bytes) {
    throw new HttpError(404, "world map not found");
  }
  return new Response(bytes, {
    status: 200,
    headers: { "Content-Type": "application/octet-stream" },
  });
}

function listWorldMapHistory(db: AppDb, siteId: string): Response {
  if (!db.findSite(siteId)) {
    throw new HttpError(404, "site not found");
  }
  return json(200, { history: db.listHistory(siteId) });
}

function getHistoryWorldMap(db: AppDb, siteId: string, sha256: string): Response {
  if (!db.findSite(siteId)) {
    throw new HttpError(404, "site not found");
  }
  const bytes = db.getHistoryMap(siteId, sha256);
  if (!bytes) {
    throw new HttpError(404, "world map version not found");
  }
  return new Response(bytes, {
    status: 200,
    headers: { "Content-Type": "application/octet-stream" },
  });
}

async function putSnapshot(req: Request, db: AppDb, siteId: string): Promise<Response> {
  if (!db.findSite(siteId)) {
    throw new HttpError(404, "site not found");
  }
  rejectIfTooLarge(req, MAX_SNAPSHOT_BYTES, "snapshot too large");
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_SNAPSHOT_BYTES) {
    throw new HttpError(413, "snapshot too large");
  }
  if (!isJpeg(bytes)) {
    throw new HttpError(400, "snapshot must be a JPEG");
  }
  db.setSnapshot(siteId, bytes, new Date().toISOString());
  return new Response(null, { status: 204 });
}

function getSnapshot(db: AppDb, siteId: string): Response {
  const bytes = db.getSnapshot(siteId);
  if (!bytes) {
    throw new HttpError(404, "snapshot not found");
  }
  return new Response(bytes, {
    status: 200,
    headers: { "Content-Type": "image/jpeg" },
  });
}

function listStrokes(db: AppDb, siteId: string): Response {
  if (!db.findSite(siteId)) {
    throw new HttpError(404, "site not found");
  }
  return json(200, { strokes: db.listStrokes(siteId).map(toStroke) });
}

async function createStroke(req: Request, db: AppDb, siteId: string): Promise<Response> {
  if (!db.findSite(siteId)) {
    throw new HttpError(404, "site not found");
  }
  const body = await readJson(req);
  const stroke = parseStrokeBody(body, siteId);
  const existing = db.findStroke(stroke.id);
  if (existing) {
    return json(200, toStroke(existing));
  }
  db.insertStroke({
    id: stroke.id,
    siteId: stroke.siteId,
    color: stroke.color,
    widthM: stroke.widthM,
    pointsJson: JSON.stringify(stroke.points),
    createdAt: stroke.createdAt,
  });
  return json(200, stroke);
}

function parseSiteBody(body: unknown) {
  if (!isRecord(body)) {
    throw new HttpError(400, "invalid body");
  }
  const id = body.id;
  if (typeof id !== "string" || id.length === 0) {
    throw new HttpError(400, "invalid id");
  }
  const latitude = body.latitude;
  const longitude = body.longitude;
  if (!isFiniteNumber(latitude) || latitude < -90 || latitude > 90) {
    throw new HttpError(400, "invalid latitude");
  }
  if (!isFiniteNumber(longitude) || longitude < -180 || longitude > 180) {
    throw new HttpError(400, "invalid longitude");
  }
  const accuracy = body.horizontalAccuracyM;
  if (accuracy != null && !isFiniteNumber(accuracy)) {
    throw new HttpError(400, "invalid horizontalAccuracyM");
  }
  const createdAt = body.createdAt;
  if (typeof createdAt !== "string" || createdAt.length === 0) {
    throw new HttpError(400, "invalid createdAt");
  }
  return {
    id,
    latitude,
    longitude,
    horizontalAccuracyM: accuracy == null ? null : accuracy,
    createdAt,
  };
}

function parseStrokeBody(body: unknown, siteId: string) {
  if (!isRecord(body)) {
    throw new HttpError(400, "invalid body");
  }
  const id = body.id;
  if (typeof id !== "string" || id.length === 0) {
    throw new HttpError(400, "invalid id");
  }
  const color = body.color;
  if (typeof color !== "string" || !COLOR_RE.test(color)) {
    throw new HttpError(400, "invalid color");
  }
  const widthM = body.widthM;
  if (!isFiniteNumber(widthM) || widthM < MIN_WIDTH_M || widthM > MAX_WIDTH_M) {
    throw new HttpError(400, "invalid widthM");
  }
  const createdAt = body.createdAt;
  if (typeof createdAt !== "string" || createdAt.length === 0) {
    throw new HttpError(400, "invalid createdAt");
  }
  return {
    id,
    siteId,
    color,
    widthM,
    points: parsePoints(body.points),
    createdAt,
  };
}

function parsePoints(points: unknown): [number, number, number][] {
  if (!Array.isArray(points) || points.length === 0) {
    throw new HttpError(400, "invalid points");
  }
  if (points.length > MAX_STROKE_POINTS) {
    throw new HttpError(400, "too many points");
  }
  const out: [number, number, number][] = [];
  for (const point of points) {
    if (!Array.isArray(point) || point.length !== 3) {
      throw new HttpError(400, "invalid points");
    }
    const [x, y, z] = point;
    if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) {
      throw new HttpError(400, "invalid points");
    }
    out.push([x, y, z]);
  }
  return out;
}

async function readJson(req: Request): Promise<unknown> {
  rejectIfTooLarge(req, MAX_JSON_BYTES, "JSON body too large");
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength > MAX_JSON_BYTES) {
    throw new HttpError(413, "JSON body too large");
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, "invalid JSON");
  }
}

function rejectIfTooLarge(req: Request, maxBytes: number, message: string) {
  const raw = req.headers.get("content-length");
  if (raw == null) {
    return;
  }
  const length = Number(raw);
  if (Number.isFinite(length) && length > maxBytes) {
    throw new HttpError(413, message);
  }
}

function toSite(row: SiteRow) {
  return {
    id: row.id,
    latitude: row.latitude,
    longitude: row.longitude,
    horizontalAccuracyM: row.horizontal_accuracy_m,
    createdAt: row.created_at,
  };
}

function toNearbySite(row: NearbyRow, lat: number, lon: number) {
  return {
    id: row.id,
    latitude: row.latitude,
    longitude: row.longitude,
    horizontalAccuracyM: row.horizontal_accuracy_m,
    strokeCount: row.stroke_count,
    distanceM: haversineM(lat, lon, row.latitude, row.longitude),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hasSnapshot: row.has_snapshot === 1,
  };
}

function toStroke(row: StrokeRow) {
  return {
    id: row.id,
    siteId: row.site_id,
    color: row.color,
    widthM: row.width_m,
    points: JSON.parse(row.points_json) as [number, number, number][],
    createdAt: row.created_at,
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function matchSegment(path: string, prefix: string, suffix: string): string | null {
  if (!path.startsWith(prefix) || !path.endsWith(suffix)) {
    return null;
  }
  const id = path.slice(prefix.length, path.length - suffix.length);
  if (!id || id.includes("/")) {
    return null;
  }
  try {
    return decodeURIComponent(id);
  } catch {
    return null;
  }
}

function matchHistoryBlob(path: string): { siteId: string; sha256: string } | null {
  const prefix = "/v1/sites/";
  const marker = "/world-map/history/";
  if (!path.startsWith(prefix)) {
    return null;
  }
  const markerIndex = path.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }
  const siteId = path.slice(prefix.length, markerIndex);
  const sha256 = path.slice(markerIndex + marker.length);
  if (!siteId || siteId.includes("/") || !sha256 || sha256.includes("/")) {
    return null;
  }
  if (!/^[0-9a-f]{64}$/i.test(sha256)) {
    throw new HttpError(400, "invalid sha256");
  }
  try {
    return { siteId: decodeURIComponent(siteId), sha256: sha256.toLowerCase() };
  } catch {
    return null;
  }
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
}

function parseQueryNumber(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
