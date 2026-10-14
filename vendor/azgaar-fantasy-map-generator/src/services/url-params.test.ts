import { describe, expect, it } from "vitest";
import { getRequestedMapSize } from "./map-size";

describe("getRequestedMapSize", () => {
  it("leaves missing dimensions unresolved", () => {
    expect(getRequestedMapSize(new URLSearchParams("seed=test"))).toEqual({
      width: undefined,
      height: undefined,
      points: undefined
    });
  });

  it("takes positive dimensions from a shared-map URL", () => {
    expect(getRequestedMapSize(new URLSearchParams("width=900&height=600"))).toEqual({
      width: 900,
      height: 600,
      points: undefined
    });
  });

  it("ignores dimensions that cannot produce a graph", () => {
    expect(getRequestedMapSize(new URLSearchParams("width=0&height=invalid"))).toEqual({
      width: undefined,
      height: undefined,
      points: undefined
    });
  });

  it("takes an exact points count from the link (MIR Earth-sized maps)", () => {
    expect(getRequestedMapSize(new URLSearchParams("width=40075017&height=20003932&points=1000000"))).toEqual({
      width: 40075017,
      height: 20003932,
      points: 1000000
    });
    expect(getRequestedMapSize(new URLSearchParams("points=0")).points).toBeUndefined();
    expect(getRequestedMapSize(new URLSearchParams("points=heavy")).points).toBeUndefined();
  });
});

describe("MIR physical whole-world profile", () => {
  it("keeps metre-sized planet extents out of the SVG / Voronoi graph", () => {
    const size = getRequestedMapSize(new URLSearchParams("world=earth&width=40075017&height=20003932&points=1000000"));
    expect(size.width).toBe(2000);
    expect(size.height).toBeCloseTo(2000 * 20003932 / 40075017, 8);
    expect(size.points).toBe(100000);
  });

  it("retains the same graph resolution on a planet twice the physical size", () => {
    const normal = getRequestedMapSize(new URLSearchParams("world=earth&width=40075017&height=20003932"));
    const larger = getRequestedMapSize(new URLSearchParams("world=earth&width=80150034&height=40007864"));
    expect(larger).toEqual(normal);
  });
});
