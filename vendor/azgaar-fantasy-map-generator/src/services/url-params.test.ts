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
