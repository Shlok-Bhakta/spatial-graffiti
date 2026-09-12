import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sites (
    id TEXT PRIMARY KEY,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    horizontal_accuracy_m REAL,
    world_map BLOB,
    world_map_sha256 TEXT,
    world_map_bytes INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sites_latitude ON sites(latitude);
CREATE INDEX IF NOT EXISTS idx_sites_longitude ON sites(longitude);
CREATE TABLE IF NOT EXISTS strokes (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL,
    color TEXT NOT NULL,
    width_m REAL NOT NULL,
    points_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(site_id) REFERENCES sites(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_strokes_site ON strokes(site_id);
`;

export type SiteRow = {
  id: string;
  latitude: number;
  longitude: number;
  horizontal_accuracy_m: number | null;
  world_map: Uint8Array | null;
  world_map_sha256: string | null;
  world_map_bytes: number | null;
  created_at: string;
  updated_at: string;
};

export type NearbyRow = {
  id: string;
  latitude: number;
  longitude: number;
  horizontal_accuracy_m: number | null;
  created_at: string;
};

export type StrokeRow = {
  id: string;
  site_id: string;
  color: string;
  width_m: number;
  points_json: string;
  created_at: string;
};

export type WorldMapMeta = {
  world_map_sha256: string | null;
  world_map_bytes: number | null;
};

export type AppDb = ReturnType<typeof openDb>;

function asBytes(value: unknown): Uint8Array | null {
  if (value == null) {
    return null;
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  return null;
}

export function openDb(path: string) {
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch {
    // scratch and other locked roots cannot mkdir; the volume must already exist
  }

  const db = new Database(path, { create: true });
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);

  const getSiteStmt = db.query(
    `SELECT id, latitude, longitude, horizontal_accuracy_m, world_map,
            world_map_sha256, world_map_bytes, created_at, updated_at
     FROM sites WHERE id = ?`,
  );
  const insertSiteStmt = db.query(
    `INSERT INTO sites (id, latitude, longitude, horizontal_accuracy_m, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const nearbyStmt = db.query(
    `SELECT id, latitude, longitude, horizontal_accuracy_m, created_at
     FROM sites
     WHERE latitude BETWEEN ? AND ?
       AND longitude BETWEEN ? AND ?
       AND world_map IS NOT NULL`,
  );
  const updateWorldMapStmt = db.query(
    `UPDATE sites
     SET world_map = ?, world_map_sha256 = ?, world_map_bytes = ?, updated_at = ?
     WHERE id = ?`,
  );
  const getWorldMapStmt = db.query(`SELECT world_map FROM sites WHERE id = ? AND world_map IS NOT NULL`);
  const getWorldMapMetaStmt = db.query(
    `SELECT world_map_sha256, world_map_bytes FROM sites WHERE id = ?`,
  );
  const listStrokesStmt = db.query(
    `SELECT id, site_id, color, width_m, points_json, created_at
     FROM strokes WHERE site_id = ? ORDER BY created_at ASC, id ASC`,
  );
  const getStrokeStmt = db.query(
    `SELECT id, site_id, color, width_m, points_json, created_at
     FROM strokes WHERE id = ?`,
  );
  const insertStrokeStmt = db.query(
    `INSERT INTO strokes (id, site_id, color, width_m, points_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const countStrokesStmt = db.query(`SELECT COUNT(*) AS n FROM strokes WHERE site_id = ?`);

  return {
    close() {
      db.close();
    },
    findSite(id: string): SiteRow | null {
      const row = getSiteStmt.get(id) as SiteRow | null;
      if (!row) {
        return null;
      }
      return { ...row, world_map: asBytes(row.world_map) };
    },
    insertSite(row: {
      id: string;
      latitude: number;
      longitude: number;
      horizontalAccuracyM: number | null;
      createdAt: string;
      updatedAt: string;
    }) {
      insertSiteStmt.run(
        row.id,
        row.latitude,
        row.longitude,
        row.horizontalAccuracyM,
        row.createdAt,
        row.updatedAt,
      );
    },
    findNearby(minLat: number, maxLat: number, minLon: number, maxLon: number): NearbyRow[] {
      return nearbyStmt.all(minLat, maxLat, minLon, maxLon) as NearbyRow[];
    },
    setWorldMap(id: string, bytes: Uint8Array, sha256: string, byteCount: number, updatedAt: string) {
      updateWorldMapStmt.run(bytes, sha256, byteCount, updatedAt, id);
    },
    getWorldMap(id: string): Uint8Array | null {
      const row = getWorldMapStmt.get(id) as { world_map: unknown } | null;
      return row ? asBytes(row.world_map) : null;
    },
    getWorldMapMeta(id: string): WorldMapMeta | null {
      return (getWorldMapMetaStmt.get(id) as WorldMapMeta | null) ?? null;
    },
    listStrokes(siteId: string): StrokeRow[] {
      return listStrokesStmt.all(siteId) as StrokeRow[];
    },
    findStroke(id: string): StrokeRow | null {
      return (getStrokeStmt.get(id) as StrokeRow | null) ?? null;
    },
    insertStroke(row: {
      id: string;
      siteId: string;
      color: string;
      widthM: number;
      pointsJson: string;
      createdAt: string;
    }) {
      insertStrokeStmt.run(row.id, row.siteId, row.color, row.widthM, row.pointsJson, row.createdAt);
    },
    countStrokes(siteId: string): number {
      const row = countStrokesStmt.get(siteId) as { n: number } | null;
      return row?.n ?? 0;
    },
    clear() {
      db.exec("DELETE FROM strokes");
      db.exec("DELETE FROM sites");
    },
  };
}
