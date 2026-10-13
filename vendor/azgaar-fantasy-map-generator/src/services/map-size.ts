export interface RequestedMapSize {
  width?: number;
  height?: number;
  points?: number;
}

export function getRequestedMapSize(params: URLSearchParams): RequestedMapSize {
  const dimension = (name: "width" | "height") => {
    const value = Number(params.get(name));
    return Number.isFinite(value) && value > 0 ? value : undefined;
  };

  // MIR (The civilization of the sages) asks for an exact point count in the
  // link (`points=1000000`): its maps are Earth-sized, where the density
  // slider's steps were calibrated for overview canvases. An exact count in
  // the link keeps the map dependent on the link alone, like seed and size.
  const pointsValue = Number(params.get("points"));
  const points = Number.isFinite(pointsValue) && pointsValue > 0 ? Math.round(pointsValue) : undefined;

  return { width: dimension("width"), height: dimension("height"), points };
}
