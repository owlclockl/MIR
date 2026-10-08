# Azgaar FMG in MIR

MIR vendors the complete web source and static assets of [Azgaar's Fantasy Map Generator](https://github.com/Azgaar/Fantasy-Map-Generator), then builds it into `public/fmg/`. Upstream snapshot: commit `546c41d37e1daf842df620139e3228553e2f0847`, package version `1.154.0`, MIT License (copyright Max Haniyeu / Azgaar and contributors). The upstream license is kept in [`LICENSE`](LICENSE).

## MIR adaptations

- The full editor is hosted at `/fmg/` and shown from the full-screen MIR world studio, not opened in a small dialog.
- The MIR world seed is passed as Azgaar's `?seed=` parameter. Azgaar saves its maps/options in its own browser storage; export a map from its editor to keep or share it.
- The first map uses Azgaar's built-in `night` style. UI controls use a forest-green / warm-gold palette from `public/mir-theme.css`; other map styles remain selectable in the editor.
- The nested Azgaar service worker is disabled under `/fmg/`. MIR's root worker caches the full editor offline, avoids conflicting worker scopes, and avoids the upstream Workbox CDN request. The `electron` Vite mode also removes upstream Google Analytics from the built page.
- The upstream interface remains in English; MIR's wrapper, navigation, seed hand-off and attribution are Russian.

These are integration changes, not a rewrite of Azgaar's map-generation model. The MIR voxel atlas remains a separate native generator; the same seed opens a deterministic Azgaar map, but the two engines do not convert each other's geometry or game state.

## Rebuilding the vendored editor

The already-built static app in `public/fmg/` is committed, so ordinary `npm ci` + `npm run build` do not need Azgaar's development dependencies. To rebuild after editing vendored source, use Node 24 or newer (upstream engine requirement):

```sh
npm run fmg:install
npm run fmg:build
npm run build
```

`fmg:install` installs only the vendored package's lockfile; its `node_modules/` is ignored by Git. `fmg:build` emits a Vite production build with base `/fmg/` and omits the nested `sw.js`. The root MIR service worker includes every generated file in its content fingerprint and offline precache. The stand-alone `mir.html` intentionally stays a one-file product and does not embed the 22 MiB editor; its native MIR atlas remains available there.
