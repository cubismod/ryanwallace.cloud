# Map Performance TODOs (First-Load Focus)

Purpose: Speed up first paint and interactivity on an uncached load of the map page, without sacrificing correctness. Items are grouped by impact area and ordered by priority. I’ll work top-down unless you prefer a different order.

Legend: [ ] todo · [x] done · P0 critical · P1 high · P2 nice-to-have

## Bundle Size

- [x] P0 Replace Turf namespace import with submodules in `src/geometry-utils.ts` (and anywhere else using Turf) to reduce bundle weight.
  - Swap to `@turf/along`, `@turf/nearest-point-on-line`, `@turf/length`, `@turf/distance`, `@turf/helpers`.
  - Verify tree-shaking and type compatibility; run typecheck.
- [x] P1 Code-split non-critical features and lazy-load:
  - Alerts/DataTables (`src/alerts.ts`) when the alerts section becomes visible. (done)
  - Amtrak helpers (`src/amtrak.ts`) only when Amtrak layer is enabled. (done)
  - Elf score utilities (`src/elf-score.ts`) on first toggle/use and on-demand for popups/search. (done)
- [ ] P2 Convert jQuery to module import (or keep CDN and add `defer`) to avoid render-blocking.

## Data & API Requests

- [x] P0 Defer `/shapes` fetch until after first vehicle render (or on first “Routes” overlay enable). Gate by `requestIdleCallback` fallback to `setTimeout`.
- [ ] P1 Scope shapes: support per-mode or per-route fetch (server/API change) and load only enabled layers.
  - Client-side partial: shapes route layers default OFF; load data on first enable. (done)
- [ ] P1 Pre-simplify shapes server-side (zoom-aware generalization and coordinate quantization) and serve Gzip/Brotli.
- [ ] P2 Stagger requests: vehicles first, shapes second, Amtrak last/on-demand with exponential backoff on slow links.

## Rendering & Map Tiles

- [x] P1 Lighter basemap for first paint:
  - Use OSM raster or MapTiler raster initially, upgrade to vector style after idle.
  - Or keep raster permanently for slow connections (`navigator.connection.effectiveType`).
- [x] P2 Delay MarkerCluster load until marker count > N (conditional dynamic import) to reduce initial JS execution.

## Client Caching

- [x] P0 Add a service worker (custom) to precache/cache-first for static assets, tiles, and shapes; network-first for vehicles.

---

## Server/CDN (Fly.io + Caddy)

These items belong in Fly.io deploy/Dockerfile and Caddyfile. They complement the client changes above and are all P1 unless noted.

- [x] Configure compression: use Caddy `encode zstd gzip` for optimal on-the-fly compression. (done)
- [x] Long‑cache hashed static assets: add `Cache-Control: public, max-age=31536000, immutable` for content‑hashed CSS/JS/images. (done)
- [x] Default cache for non‑hashed assets: moderate TTL (e.g., 1 day) to allow updates without hard refresh. (done)
- [ ] Shapes caching on the API host (imt): serve `Cache-Control: public, max-age=604800, stale-while-revalidate=86400` and ensure compression.
- [ ] Vehicles caching on the API host (imt): set `Cache-Control: no-store` (or `max-age=1, stale-while-revalidate=2`) to prevent stale data.
- [ ] HTTP/3/QUIC: Caddy enables this automatically with TLS; verify it’s active on Fly.io (no change usually required).
- [ ] Verify hashed filenames in production build (Parcel usually outputs content‑hashed filenames by default).
- [ ] Optional: precompress static (`.br`/`.zst`) during build; Caddy can serve precompressed when present.

Site Caddyfile changes (applied)

```
encode zstd gzip

@hashed {
  path_regexp hashed (.*)\.(?:[0-9a-f]{8,})\.(?:css|js|svg|png|jpg|jpeg|webp|gif|woff2)
}
header @hashed Cache-Control "public, max-age=31536000, immutable"

@assets {
  path *.css *.js *.svg *.png *.jpg *.jpeg *.webp *.gif *.woff2
}
header @assets Cache-Control "public, max-age=86400"

file_server
```

If the vehicles API (imt) also runs behind Caddy, apply:

```
@shapes path /shapes*
header @shapes Cache-Control "public, max-age=604800, stale-while-revalidate=86400"
header @shapes Content-Type "application/json; charset=utf-8"

@vehicles path /vehicles*
header @vehicles Cache-Control "no-store"
header @vehicles Content-Type "application/json; charset=utf-8"

encode zstd gzip
```

Dockerfile notes

- Use the official `caddy` image; no plugin required for `zstd`/`gzip` (both supported in stock Caddy v2).
- Copy the built Parcel `dist/` into the image and point Caddy `root` to it.
- Optionally precompress assets in the build stage; Caddy will serve precompressed files when present.

## Critical Path (HTML/CSS)

- [x] P0 Add preconnects for external origins used on first load:
  - `https://tile.openstreetmap.org` or MapTiler host, `https://imt.ryanwallace.cloud`, `https://bos.ryanwallace.cloud`.
- [x] P1 Lazy-load DataTables CSS only when alerts table is initialized. If keeping in HTML, use `rel="preload" as="style" onload="this.rel='stylesheet'"`.
- [ ] P2 Audit `type="module"` script placement and ensure no other render-blocking scripts/styles remain.

## UX / Perceived Speed

- [x] P1 Keep the map interactive as soon as base tiles load (even if shapes/alerts lag). Ensure loading overlay appears instantly.
  - Overlay is non-blocking (pointer-events: none) and hides on first tile 'load'.
- [ ] P2 Connection-aware loading: On 2G/slow-3G, default to no shapes/Amtrak and prompt to enable.

---

## Implementation Plan (Initial Pass)

1. P0 Turf submodules in `src/geometry-utils.ts` (quick win, minimal risk).
2. P0 Defer `/shapes` until after first vehicle paint or when routes overlay enabled.
3. P0 Preconnect tags in `src/index.html` for tile/API hosts; make external CSS non-blocking.
4. P0 Service worker with Workbox to precache shell and cache tiles/shapes.
5. P1 Lazy-load alerts/DataTables; remove blocking DataTables CSS from initial HTML.
6. P1 Raster-first tiles; switch to vector after idle or keep raster on slow networks.

## Notes

- Build system: Parcel already in use. Code-splitting via dynamic imports is supported.
- Tests: Manual verification (build + load). Will keep changes scoped and reversible per module.
- Server/API: Some items (shape simplification, caching headers, Brotli) require server/CDN updates.
