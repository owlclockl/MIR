// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const setZoomExtent = vi.fn();
const constrainZoom = vi.fn();

vi.mock("@/components/zoom", () => ({
  applyZoomBehavior: vi.fn(),
  constrainZoom,
  setTranslateExtent: vi.fn(),
  setZoomExtent
}));
vi.mock("@/components/layers", () => ({ Layers: { draw: vi.fn() } }));
vi.mock("@/renderers/draw-legend", () => ({ fitLegendBox: vi.fn() }));
vi.mock("@/components/viewport", () => ({
  viewport: { width: 1000, height: 800 },
  setViewportSize: vi.fn(),
  setViewportTransform: vi.fn(),
  zoomFontSize: vi.fn(() => 10),
  ZOOM_CURVES: {}
}));

type Options = { map: { graph: { width: number; height: number } }; app: { zoomExtent: { min: number; max: number } } };
const globals = globalThis as unknown as { options: Options; Options: { set: (fn: (o: Options) => unknown) => void } };

const { applyZoomExtent } = await import("@/components/canvas");

beforeEach(() => {
  setZoomExtent.mockClear();
  constrainZoom.mockClear();
  globals.options = { map: { graph: { width: 4000, height: 2000 } }, app: { zoomExtent: { min: 0.1, max: 150 } } };
  globals.Options = { set: (fn: (o: Options) => unknown) => void fn(globals.options) };
});

describe("applyZoomExtent", () => {
  it("lets a world larger than the window step back a quarter beyond the fitted view", () => {
    // cover = max(1000/4000, 800/2000) = 0.4: 0.4 is the fitted world, 0.1 is the floor
    applyZoomExtent();

    expect(globals.options.app.zoomExtent.min).toBe(0.1);
    expect(setZoomExtent).toHaveBeenCalledExactlyOnceWith(0.1, 150);
    expect(constrainZoom).toHaveBeenCalledExactlyOnceWith();
  });

  it("never lets the floor push a fitted-out map away from the screen", () => {
    globals.options.app.zoomExtent.min = 1; // coarser than the fit: the fit wins, as before
    applyZoomExtent();

    expect(globals.options.app.zoomExtent.min).toBe(0.4);
  });

  it("keeps a small map from shrinking past a quarter of its own size", () => {
    globals.options.map.graph = { width: 500, height: 400 };
    globals.options.app.zoomExtent.min = 0.01; // cover = 2, so 0.5 is the deepest look-back
    applyZoomExtent();

    expect(globals.options.app.zoomExtent.min).toBe(0.5);
  });
});
