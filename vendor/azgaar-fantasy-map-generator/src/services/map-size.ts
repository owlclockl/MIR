import { EARTH_WORLD_POINTS, readEarthWorldProfile } from "./earth-world";

export interface RequestedMapSize {
  width?: number;
  height?: number;
  points?: number;
}

export function getRequestedMapSize(params: URLSearchParams): RequestedMapSize {
  const earth = readEarthWorldProfile(params);
  if (earth) return { width: earth.graphWidth, height: earth.graphHeight, points: EARTH_WORLD_POINTS };

  const dimension = (name: "width" | "height") => {
    const value = Number(params.get(name));
    return Number.isFinite(value) && value > 0 ? value : undefined;
  };

  // Legacy / standalone links still accept their exact point count. MIR's
  // opt-in physical whole-world profile above uses the supported 100K density.
  const pointsValue = Number(params.get("points"));
  const points = Number.isFinite(pointsValue) && pointsValue > 0 ? Math.round(pointsValue) : undefined;

  return { width: dimension("width"), height: dimension("height"), points };
}
