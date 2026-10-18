// Sages integration: physical planet size is not the SVG / Voronoi coordinate extent.
// Keeping a 40-million-unit graph saturates upstream Uint16 cell areas and does
// not enlarge heightmap features. Use the supported 100K terrain density instead.
import type { OptionsData } from "@/components/options-schema";

export const EARTH_WORLD_POINTS = 100_000;
export const EARTH_GRAPH_WIDTH = 2000;

export interface EarthWorldProfile {
  widthKm: number;
  heightKm: number;
  graphWidth: number;
  graphHeight: number;
}

/** Explicit opt-in: old shared links and overview slots retain upstream semantics. */
export function readEarthWorldProfile(params: URLSearchParams): EarthWorldProfile | undefined {
  if (params.get("world") !== "earth") return;
  const width = Number(params.get("width"));
  const height = Number(params.get("height"));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1_000_000 || height < 1_000_000) return;
  // Sages' world presets are 2:1. Reject malformed/extreme aspect ratios rather
  // than building an unbounded SVG, while retaining the exact physical extent.
  const aspect = width / height;
  if (aspect < 1 || aspect > 4 || width > 1_000_000_000 || height > 1_000_000_000) return;
  return {
    widthKm: width / 1000,
    heightKm: height / 1000,
    graphWidth: EARTH_GRAPH_WIDTH,
    graphHeight: EARTH_GRAPH_WIDTH / aspect
  };
}

/** Apply AFTER Options.randomize on every fresh generation, before the pipeline. */
export function applyEarthWorldProfile(target: OptionsData, world: EarthWorldProfile): void {
  target.generation.graph.width = world.graphWidth;
  target.generation.graph.height = world.graphHeight;
  target.generation.graph.density = 13; // upstream's supported 100K shape coefficients
  target.map.graph = { width: world.graphWidth, height: world.graphHeight, points: EARTH_WORLD_POINTS };
  target.generation.template = "earthContinents";
  target.generation.geography = { mapSize: 100, latitude: 50, longitude: 50 };
  target.map.units.distance = { unit: "km", scale: world.widthKm / world.graphWidth };
  target.map.units.area.unit = "square"; // upstream derives km² from distance units
  target.map.units.height.unit = "m";
  target.map.units.height.exponent = 2.05; // Earth-like relief: low plains, peaks up to ~8 km
  target.map.units.temperature.unit = "°C";
}
