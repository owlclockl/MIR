# XaeroPlus in MIR: exact snapshot + browser cartography

## Upstream source snapshot

- Repository: https://github.com/rfresh2/XaeroPlus
- Default / selected branch: `1.20.1`.
- Commit: `18eac052d8ab6c7885976a0ff3fd215de857f6bd`.
- Version: `2.37.0` (gradle.properties), Minecraft target `1.20.1`.
- License: MIT, Copyright (c) 2022 rfresh2. See `upstream/LICENSE`.
- `upstream/` contains **all 345 Git-tracked files** at this commit, including
  274 Java files, shader/resources, Fabric/Forge entries, Gradle build sources,
  wrapper and GitHub workflows. No selection/trimming or edits to these files.
  Total file bytes: 1,829,603. Git history and the nested .git directory are not copied.
- `upstream-manifest.json` lists every path, byte length and SHA-256.
  `npm run test:xaeroplus` verifies both the file set and all checksums.

**Full snapshot does not mean full browser integration.** Original Java files
are preserved for reference/further porting; Vite does not compile or execute
Minecraft mods. No vendored workflow, wrapper, Gradle task or external mod was
executed during this integration.

## Real code used in the browser

`src/map/xaeroplus/geometry.js` translates selected MIT source algorithms:

| Upstream file | Ported code | Runtime use |
| --- | --- | --- |
| `common/src/main/java/xaeroplus/util/ColorHelper.java` | ARGB packing, alpha replacement, channel extraction, normalized RGBA | saved drawing color, alpha-80 preview, pin color |
| `common/src/main/java/xaeroplus/feature/render/line/Line.java` | length, extrapolateToWorldBorder, extrapolateToMaxCoord, lineClip, angle | line culling, infinite-line extrapolation, temporary physical ruler |
| `common/src/main/java/xaeroplus/feature/render/ellipse/Ellipse.java` | radii validation, intersects | ellipse overlay culling |
| `common/src/main/java/xaeroplus/module/impl/Drawing.java` | snap, getSnapThreshold, ellipseFromCenterAndRadii, snapEllipse | line/ellipse cardinal/diagonal/circle snapping; six-mode browser host |
| `common/src/main/java/xaeroplus/module/impl/RegionGrid.java` | 512-unit boundaries; region names at region origin +264 | source-coordinate region grid and labels, visible-window culling |
| `common/src/main/java/xaeroplus/module/impl/MapArtGrid.java` | -64 origin, 128 × 2^zoom step, zoom 0…4 | stable source-coordinate map-art grid (fixed origin, unlike upstream viewport-relative loop) |
| `common/src/main/java/xaeroplus/util/DrawOrderHelper.java` | pipe-string load/serialize | persisted order of actual Canvas layers |

`Math` substitutes Minecraft's Mth for these methods; Java records become JS
classes. The active drawing adapter now rounds anchors in physical metres, so tools
remain usable at the metre zoom. RegionGrid/MapArtGrid still use source-map
units (roughly 0–2000); MIR’s automatic metre grid is distinct from them.
The metre-column renderer is a browser adapter over Azgaar, not Minecraft terrain. The
port does not emulate Java integer overflow at arbitrary out-of-range inputs.
Normalized doubles are used for viewport culling. `Ellipse.intersects` remains
upstream's bounding-box test, not an exact ellipse/rectangle intersection.

`drawing.js` is the MIR-specific browser adapter: normalized coordinates,
Canvas 2D painting, physical length conversion, all six DrawingMode tools:
line, infinite line, highlight rectangle, center/radius ellipse, text, temporary
ruler. Infinite lines use upstream extrapolation in integer host units then
intersect MIR's rectangle, not Minecraft's square world border.

`view.js` hosts pointer input, preview, object selection/moving, coordinate/name/
text/style editing, deletion, and 64-step atomic pin+drawing undo/redo. It also
provides a viewport minimap, keyboard navigation, ordered river/grid/drawing/pin
layers, JSON/GeoJSON import/export and view/full-map PNG export. These are MIR
browser host implementations, **not** original SQLite/OpenGL/minimap internals.
Settings persist through `store` (including the upstream draw-order codec).
Drawing validation allows only finite normalized anchors; text is plain text,
limited to 160 characters; pins remain limited to 40-character names.

Storage: `mir:surface-drawings`, 24 worlds × 256 figures; `mir:surface-pins`,
24 worlds × 64 pins; `mir:surface-settings`, validated local preferences. Imports
are bounded at 2 MiB, 256 drawings and 64 pins, validated before any mutation,
and undoable as one operation. Preference changes are not in object history.
JSON requires the same seed/dimensions; GeoJSON uses a fictional whole-world
longitude/latitude mapping (not real Earth georeferencing). MIR metadata retains
exact shape types on round-trip; generic Point, LineString and Polygon contours
are accepted. Exported ellipses use 64-segment clipped polygons. PNG uses the
existing raster, not newly generated terrain; full-map output is at most 4096 px
on the longest side and cannot create detail absent in the source.

Full MIT text is also runtime data in `src/map/xaeroplus/license.js`, shown in
«Что перенесено · лицензия» and preserved in web and single bundles. Build
checks verify notice and integration markers in both outputs.

## What is NOT ported or running

This does not include the base Xaero's World Map source or executable mod.
XaeroPlus's `common/build.gradle.kts` and `settings.gradle.kts` separately
reference World Map, Minimap, XaeroLib, Minecraft and mod-loader libraries.
The README explicitly requires the three separate mod JARs.

The following original Java subsystems are copied but **not executed in MIR**:
Fabric/Forge/mixins and event bus, Minecraft chunk/block/biome scanner, cave and
Nether modes, world/minimap session management, Caffeine/SQLite caches, LWJGL
and Minecraft OpenGL shaders/FBOs, minimap FPS limiting, entity/player radar,
Baritone, WorldTools, portal/new/old chunk detectors, beacons, game commands,
multiplayer integrations. The browser drawing modes listed above do work; they
are not Minecraft block renderers.
There is no fake empty substitute pretending to provide those features.

The Gradle Minecraft target was not built here: no Java/Javac is installed and
the environment's network allowlist excludes its Maven/Gradle/Modrinth hosts.
Browser tests do not validate the original Java mod or claim its full behavior.

MIR's world generator remains Azgaar with the existing Earth-scale profile.
No new terrain engine and no restoration of the previously deleted generator.

## Checks

- `npm run test:xaeroplus`: complete upstream source integrity, geometry/color
  regression vectors, Canvas adapter and bounded/validated storage.
- `npm run test:surface`: real DOM input flow with mocked Canvas; drawing,
  all drawing modes, editing/moving/deletion, cancellation, undo/redo, pin history
  and preference persistence across remount.
- `npm run test:surface-browser -- http://127.0.0.1:4173`: actual Chromium, real
  terrain generation, all six tools, editing/history, pixel-changing layer order
  and visibility, grids/minimap, actual downloaded JSON/GeoJSON/PNG, rejected and
  undoable imports, remount, 320/390px viewports,
  file:// single bundle and full MIT notice. Requires vendor Playwright and
  a Chromium installation; optionally set MIR_CHROMIUM_EXECUTABLE. Screenshots
  go to ignored `logs/surface-xaeroplus-*.png`.
- `npm run build && npm run single && npm run test:build`: web/offline outputs,
  including MIT notice. `test:ui`, `test:earth` and `test:spacing` remain required.
