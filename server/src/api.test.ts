import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createApp } from "./app";
import { openDb } from "./db";

const METERS_PER_DEG_LAT = 111_320;
const ORIGIN = { lat: 37.7749, lon: -122.4194 };

const tempDir = mkdtempSync(join(tmpdir(), "spatial-graffiti-"));
const dbPath = join(tempDir, "test.sqlite");
const db = openDb(dbPath);
const handle = createApp(db);

beforeAll(() => {
  expect(dbPath).not.toContain("graffiti.sqlite");
  expect(dbPath.startsWith(tempDir)).toBe(true);
});

beforeEach(() => {
  db.clear();
});

afterAll(() => {
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("GET /health", () => {
  test("returns ok", async () => {
    const res = await api("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("POST /v1/sites", () => {
  test("create site", async () => {
    const site = sampleSite();
    const res = await api("/v1/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(site),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(site);
  });
});

describe("GET /v1/sites/nearby", () => {
  test("does not offer tiny invalid maps as rooms", async () => {
    const site = await insertSite(ORIGIN);
    expect((await putWorldMap(site.id, arbitraryBytes())).status).toBe(204);
    expect((await readNearby(await nearby(ORIGIN, 100))).sites).toHaveLength(0);
  });
  test("nearby site returned inside radius", async () => {
    const site = await insertMappedSite(shiftLat(ORIGIN, 20));
    expect((await postStroke(site.id, sampleStroke(site.id))).status).toBe(200);
    const res = await nearby(ORIGIN, 100);
    expect(res.status).toBe(200);
    const body = await readNearby(res);
    expect(body.sites).toHaveLength(1);
    expect(body.sites[0].id).toBe(site.id);
    expect(body.sites[0].strokeCount).toBe(1);
    expect(body.sites[0].distanceM).toBeGreaterThan(0);
    expect(body.sites[0].distanceM).toBeLessThan(25);
    expect(body.sites[0]).not.toHaveProperty("worldMap");
    expect(body.sites[0]).not.toHaveProperty("world_map");
  });

  test("site not returned outside radius", async () => {
    await insertMappedSite(shiftLat(ORIGIN, 200));
    const res = await nearby(ORIGIN, 100);
    expect(res.status).toBe(200);
    expect((await readNearby(res)).sites).toEqual([]);
  });

  test("results sorted by distance", async () => {
    const far = await insertMappedSite(shiftLat(ORIGIN, 50));
    const near = await insertMappedSite(shiftLat(ORIGIN, 10));
    const mid = await insertMappedSite(shiftLat(ORIGIN, 30));
    const res = await nearby(ORIGIN, 100);
    const ids = (await readNearby(res)).sites.map((site) => site.id);
    expect(ids).toEqual([near.id, mid.id, far.id]);
  });

  test("site without world map excluded from nearby", async () => {
    await insertSite(ORIGIN);
    const mapped = await insertMappedSite(shiftLat(ORIGIN, 15));
    const res = await nearby(ORIGIN, 100);
    const ids = (await readNearby(res)).sites.map((site) => site.id);
    expect(ids).toEqual([mapped.id]);
  });

  test("invalid coordinates rejected", async () => {
    const bad = [
      `/v1/sites/nearby?lat=91&lon=0&radiusM=100`,
      `/v1/sites/nearby?lat=-91&lon=0&radiusM=100`,
      `/v1/sites/nearby?lat=0&lon=181&radiusM=100`,
      `/v1/sites/nearby?lat=0&lon=-181&radiusM=100`,
      `/v1/sites/nearby?lat=0&lon=0&radiusM=0`,
      `/v1/sites/nearby?lat=0&lon=0&radiusM=501`,
      `/v1/sites/nearby?lat=abc&lon=0&radiusM=100`,
    ];
    for (const path of bad) {
      const res = await api(path);
      expect(res.status).toBe(400);
    }

    const create = await api("/v1/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sampleSite({ latitude: 91 })),
    });
    expect(create.status).toBe(400);
  });
});

describe("site feature prints", () => {
  test("stores visual descriptors for candidate ranking", async () => {
    const site = await insertSite(ORIGIN);
    const data = Buffer.alloc(128, 42).toString("base64");
    const id = crypto.randomUUID();
    const posted = await api(`/v1/sites/${site.id}/feature-prints`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, data }),
    });
    expect(posted.status).toBe(200);
    const listed = await api(`/v1/sites/${site.id}/feature-prints`);
    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual({ featurePrints: [{ id, data }] });
  });
});

describe("world map", () => {
  test("upload arbitrary world-map bytes", async () => {
    const site = await insertSite(ORIGIN);
    const bytes = arbitraryBytes();
    const res = await putWorldMap(site.id, bytes);
    expect(res.status).toBe(204);
  });

  test("download identical bytes", async () => {
    const site = await insertSite(ORIGIN);
    const bytes = arbitraryBytes();
    await putWorldMap(site.id, bytes);
    const res = await api(`/v1/sites/${site.id}/world-map`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([...bytes]);
  });

  test("SHA/byte count stored correctly", async () => {
    const site = await insertSite(ORIGIN);
    const bytes = arbitraryBytes();
    await putWorldMap(site.id, bytes);
    const meta = db.getWorldMapMeta(site.id);
    expect(meta?.world_map_bytes).toBe(bytes.byteLength);
    expect(meta?.world_map_sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
  });

  test("previous map kept in history on overwrite", async () => {
    const site = await insertSite(ORIGIN);
    const first = arbitraryBytes();
    const second = Uint8Array.from([0x01, 0x02, 0x03, 0x04]);
    await putWorldMap(site.id, first);
    await putWorldMap(site.id, second);
    const firstSha = createHash("sha256").update(first).digest("hex");

    const list = await api(`/v1/sites/${site.id}/world-map/history`);
    expect(list.status).toBe(200);
    const body = (await list.json()) as {
      history: Array<{ sha256: string; byte_count: number; createdAt: string }>;
    };
    expect(body.history).toHaveLength(1);
    expect(body.history[0].sha256).toBe(firstSha);
    expect(body.history[0].byte_count).toBe(first.byteLength);

    const blob = await api(`/v1/sites/${site.id}/world-map/history/${firstSha}`);
    expect(blob.status).toBe(200);
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([...first]);

    const missing = await api(
      `/v1/sites/${site.id}/world-map/history/${"0".repeat(64)}`,
    );
    expect(missing.status).toBe(404);
  });

  test("same map re-upload does not duplicate history", async () => {
    const site = await insertSite(ORIGIN);
    const bytes = arbitraryBytes();
    await putWorldMap(site.id, bytes);
    await putWorldMap(site.id, bytes);
    const list = await api(`/v1/sites/${site.id}/world-map/history`);
    expect(((await list.json()) as { history: unknown[] }).history).toEqual([]);
  });
});

describe("snapshots", () => {
  test("upload and download snapshot roundtrip", async () => {
    const site = await insertSite(ORIGIN);
    const jpeg = sampleJpeg();
    const put = await api(`/v1/sites/${site.id}/snapshot`, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: jpeg,
    });
    expect(put.status).toBe(204);

    const get = await api(`/v1/sites/${site.id}/snapshot`);
    expect(get.status).toBe(200);
    expect(get.headers.get("Content-Type")).toBe("image/jpeg");
    expect([...new Uint8Array(await get.arrayBuffer())]).toEqual([...jpeg]);
  });

  test("non-JPEG snapshot rejected, missing snapshot 404s", async () => {
    const site = await insertSite(ORIGIN);
    const bad = await api(`/v1/sites/${site.id}/snapshot`, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: Uint8Array.from([0x00, 0x01, 0x02, 0x03]),
    });
    expect(bad.status).toBe(400);

    const missing = await api(`/v1/sites/${site.id}/snapshot`);
    expect(missing.status).toBe(404);
  });

  test("nearby reports snapshot presence and update time", async () => {
    const plain = await insertMappedSite(shiftLat(ORIGIN, 10));
    const withSnap = await insertMappedSite(shiftLat(ORIGIN, 15));
    await api(`/v1/sites/${withSnap.id}/snapshot`, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: sampleJpeg(),
    });
    const res = await nearby(ORIGIN, 100);
    expect(res.status).toBe(200);
    const sites = (await readNearby(res)).sites;
    const plainEntry = sites.find((site) => site.id === plain.id);
    const snapEntry = sites.find((site) => site.id === withSnap.id);
    expect(plainEntry).toMatchObject({ hasSnapshot: false });
    expect(snapEntry).toMatchObject({ hasSnapshot: true });
    expect(typeof snapEntry?.updatedAt).toBe("string");
  });
});

describe("strokes", () => {
  test("create stroke", async () => {
    const site = await insertSite(ORIGIN);
    const stroke = sampleStroke(site.id);
    const res = await api(`/v1/sites/${site.id}/strokes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: stroke.id,
        color: stroke.color,
        widthM: stroke.widthM,
        points: stroke.points,
        createdAt: stroke.createdAt,
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(stroke);
  });

  test("fetch stroke", async () => {
    const site = await insertSite(ORIGIN);
    const stroke = sampleStroke(site.id);
    await postStroke(site.id, stroke);
    const res = await api(`/v1/sites/${site.id}/strokes`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ strokes: [stroke] });
  });

  test("duplicate stroke POST does not duplicate row", async () => {
    const site = await insertSite(ORIGIN);
    const stroke = sampleStroke(site.id);
    const first = await postStroke(site.id, stroke);
    const second = await postStroke(site.id, { ...stroke, color: "#00ff00" });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(stroke);
    expect(db.countStrokes(site.id)).toBe(1);
    const listed = await api(`/v1/sites/${site.id}/strokes`);
    expect((await readStrokes(listed)).strokes).toHaveLength(1);
  });

  test("invalid points rejected", async () => {
    const site = await insertSite(ORIGIN);
    const badPoints = [
      [],
      [[1, 2]],
      [[1, 2, 3, 4]],
      [[1, 2, Number.NaN]],
      [[1, 2, Number.POSITIVE_INFINITY]],
      "not-an-array",
    ];
    for (const points of badPoints) {
      const res = await postStroke(site.id, sampleStroke(site.id, { points: points as never }));
      expect(res.status).toBe(400);
    }
    expect(db.countStrokes(site.id)).toBe(0);
  });

  test("too many stroke points rejected", async () => {
    const site = await insertSite(ORIGIN);
    const points = Array.from({ length: 2049 }, () => [0, 0, 0]);
    const res = await postStroke(site.id, sampleStroke(site.id, { points }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "too many points" });
    expect(db.countStrokes(site.id)).toBe(0);

    const ok = await postStroke(
      site.id,
      sampleStroke(site.id, { points: Array.from({ length: 2048 }, () => [0, 0, 0]) }),
    );
    expect(ok.status).toBe(200);
  });
});

function api(path: string, init?: RequestInit): Promise<Response> {
  return handle(new Request(`http://graffiti.test${path}`, init));
}

async function readNearby(res: Response) {
  return (await res.json()) as {
    sites: Array<{
      id: string;
      latitude: number;
      longitude: number;
      horizontalAccuracyM: number | null;
      strokeCount: number;
      distanceM: number;
      createdAt: string;
      updatedAt: string;
      hasSnapshot: boolean;
    }>;
  };
}

async function readStrokes(res: Response) {
  return (await res.json()) as { strokes: unknown[] };
}

function nearby(point: { lat: number; lon: number }, radiusM: number): Promise<Response> {
  const query = new URLSearchParams({
    lat: String(point.lat),
    lon: String(point.lon),
    radiusM: String(radiusM),
  });
  return api(`/v1/sites/nearby?${query}`);
}

async function insertSite(point: { lat: number; lon: number }) {
  const site = sampleSite({ latitude: point.lat, longitude: point.lon });
  const res = await api("/v1/sites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(site),
  });
  expect(res.status).toBe(200);
  return site;
}

async function insertMappedSite(point: { lat: number; lon: number }) {
  const site = await insertSite(point);
  const res = await putWorldMap(site.id, new Uint8Array(2048));
  expect(res.status).toBe(204);
  return site;
}

function putWorldMap(siteId: string, bytes: Uint8Array): Promise<Response> {
  return api(`/v1/sites/${siteId}/world-map`, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: bytes,
  });
}

function postStroke(
  siteId: string,
  stroke: ReturnType<typeof sampleStroke>,
): Promise<Response> {
  return api(`/v1/sites/${siteId}/strokes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: stroke.id,
      color: stroke.color,
      widthM: stroke.widthM,
      points: stroke.points,
      createdAt: stroke.createdAt,
    }),
  });
}

function sampleSite(
  overrides: Partial<{
    id: string;
    latitude: number;
    longitude: number;
    horizontalAccuracyM: number | null;
    createdAt: string;
  }> = {},
) {
  return {
    id: crypto.randomUUID(),
    latitude: ORIGIN.lat,
    longitude: ORIGIN.lon,
    horizontalAccuracyM: 4.5,
    createdAt: "2026-09-12T05:00:00.000Z",
    ...overrides,
  };
}

function sampleStroke(
  siteId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: crypto.randomUUID(),
    siteId,
    color: "#ff3b30",
    widthM: 0.01,
    points: [
      [0, 0, 0],
      [0.2, 0.1, -0.05],
    ] as [number, number, number][],
    createdAt: "2026-09-12T05:01:00.000Z",
    ...overrides,
  };
}

function shiftLat(point: { lat: number; lon: number }, meters: number) {
  return { lat: point.lat + meters / METERS_PER_DEG_LAT, lon: point.lon };
}

function arbitraryBytes(): Uint8Array {
  return Uint8Array.from([0x00, 0xff, 0x10, 0x80, 0x7f, 0x01, 0x00, 0xde, 0xad, 0xbe, 0xef]);
}

function sampleJpeg(): Uint8Array {
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x01, 0x02, 0xff, 0xd9]);
}
