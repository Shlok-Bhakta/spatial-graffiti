import { describe, expect, test } from "bun:test";

import { boundingBox, haversineM } from "./geo";

describe("boundingBox", () => {
  test("uses 111320 m per degree of latitude", () => {
    const box = boundingBox(0, 0, 111_320);
    expect(box.minLat).toBeCloseTo(-1, 8);
    expect(box.maxLat).toBeCloseTo(1, 8);
    expect(box.minLon).toBeCloseTo(-1, 8);
    expect(box.maxLon).toBeCloseTo(1, 8);
  });

  test("covers all longitudes at the poles", () => {
    const north = boundingBox(90, 10, 100);
    expect(north.minLon).toBe(-180);
    expect(north.maxLon).toBe(180);
    expect(north.maxLat).toBe(90);

    const south = boundingBox(-90, 10, 100);
    expect(south.minLon).toBe(-180);
    expect(south.maxLon).toBe(180);
    expect(south.minLat).toBe(-90);
  });
});

describe("haversineM", () => {
  test("is zero for the same point", () => {
    expect(haversineM(37.77, -122.42, 37.77, -122.42)).toBe(0);
  });

  test("matches one degree of latitude on a 6371 km sphere", () => {
    const expected = ((2 * Math.PI * 6_371_000) / 360) * 1;
    expect(haversineM(0, 0, 1, 0)).toBeCloseTo(expected, 6);
  });
});
