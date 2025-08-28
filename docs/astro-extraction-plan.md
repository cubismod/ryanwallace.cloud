# Extracting the Map to a Standalone Astro Site

This document describes a practical, low‑risk plan to extract the mapping and tracking code under `ryanwallace.cloud/map/` into a separate Astro site. The plan minimizes TypeScript rewrites while improving performance, build speed, and maintainability. The new site targets the bostontraintracker.com domain.

## Goals
- Isolate the map into its own modern site (primary: `bostontraintracker.com`).
- Keep existing TypeScript logic intact (near‑zero core changes).
- Replace Webpack with Vite (via Astro) for faster builds and automatic code‑splitting.
- Lazy‑load heavy/optional features for better user‑perceived performance.
- Decouple Hugo integration (remove the post‑build move step).

## Outcomes
- New Astro app containing a thin UI shell and pages for `map` and `track`.
- Existing TS code from `ryanwallace.cloud/map/src` reused as a “core” module.
- Environment mapping via a tiny shim so `process.env.*` references continue to work unmodified.
- Optional PWA integration for offline caching (can be added later).

---

## 0) Prerequisites & Decisions
- Choose DNS/host: `bostontraintracker.com` (recommended). Optionally use a subdomain like `app.bostontraintracker.com`, or serve under a subpath such as `/map` if embedding within another site.
- Node: align with repo’s current toolchain (Node 20+). Keep `pnpm` as the package manager.
- Env variables: standardize on `PUBLIC_*` at build time (Astro convention for browser‑exposed vars).
- Repo layout: monorepo with an `apps/` folder, or a new repo. This guide assumes a monorepo.

---

## 1) Plan the Repository Layout
Adaptation: Reuse existing Astro app at `bostontraintracker/src` instead of creating `apps/map-web`. Keep the core code separate within that app for easier future refactors.

Target structure (adapted):

```
/ (root)
  bostontraintracker/
    src/                 # Astro site reused for map-web
      src/
        map-core/        # Unmodified core TS from ryanwallace.cloud/map/src
        lib/env-shim.ts
        pages/index.astro
        pages/track/[id].astro
      package.json
  ryanwallace.cloud/     # Existing Hugo site (unchanged)
  docs/
```

Rationale: `map-core` allows reuse of the current logic without mixing it into the Astro app’s source tree, enabling incremental refactors later.

---

## 2) Prepare the Astro App (bostontraintracker/src)
- Reuse existing Astro app under `bostontraintracker/src`.
- Keep TypeScript strict; optional: add Prettier/ESLint later.

Commands (run at repo root):

```
# install deps for the reused app
cd bostontraintracker/src
pnpm install
```

Key files in `bostontraintracker/src`:
- `src/pages/index.astro` (Home/Map page)
- `src/pages/track/[id].astro` (Vehicle tracking page)
- `src/lib/env-shim.ts` (maps `import.meta.env.PUBLIC_*` to `window.process.env`)
- `astro.config.mjs` (Astro & Vite config)
- `.env.example` (document required envs)

---

## 3) Move the Core Map Code (bostontraintracker/src/src/map-core)
- Create `bostontraintracker/src/src/map-core/`.
- Copy everything from `ryanwallace.cloud/ryanwallace.cloud/map/src/` into `bostontraintracker/src/src/map-core/` unchanged.
  - This includes: `map.ts`, `track.ts`, `markers.ts`, `marker-manager.ts`, `table-manager.ts`, `alerts.ts`, `amtrak.ts`, `geometry-utils.ts`, `utils.ts`, `layer-groups.ts`, `types/**`, `sw.ts`, and `index.html` (used only for reference; Astro supplies the page shell).
- Do not copy old `webpack.config.js`, `tsconfig.json`, or `package.json` from the old map folder—Astro/Vite will replace bundling.

Note: Keep imports like `import 'leaflet/dist/leaflet.css'` as they are; Vite will process CSS via JS imports out of the box.

---

## 4) Dependencies and Package Manifests
In `bostontraintracker/src/package.json`, add runtime deps used by the core:

- `leaflet`, `leaflet.markercluster`, `leaflet-easybutton`, `leaflet.fullscreen` (if still required)
- `@maptiler/leaflet-maptilersdk` (optional; used when API key present; use `^4.1.1`)
- `@petoc/leaflet-double-touch-drag-zoom` (use `^1.0.3`)
- `dompurify`
- `date-fns`, `date-fns-tz`
- `jquery` (only if the DataTables UI remains; consider lazy import)
- `datatables.net`, `datatables.net-dt`, `datatables.net-jqui`, `datatables.net-responsive` (only if table UI remains)
- Turf modules used: `@turf/along`, `@turf/distance`, `@turf/helpers`, `@turf/length`, `@turf/nearest-point-on-line`
 - Additional: `string-comparison` (for Levenshtein similarity in tracking)

Dev deps:
- `typescript` (Astro template includes this)
- Optional: `vite-plugin-pwa` (for service worker migration)

Install in `bostontraintracker/src`:

```
pnpm add leaflet leaflet.markercluster leaflet-easybutton leaflet.fullscreen \
  @maptiler/leaflet-maptilersdk@^4.1.1 @petoc/leaflet-double-touch-drag-zoom@^1.0.3 \
  dompurify date-fns date-fns-tz jquery \
  datatables.net datatables.net-dt datatables.net-jqui datatables.net-responsive \
  @turf/along @turf/distance @turf/helpers @turf/length @turf/nearest-point-on-line
```

Remove deps you don’t actually use to keep bundles lean.

---

## 5) Environment Variables (PUBLIC_*)
Use `PUBLIC_*` prefixes so Astro exposes values to the browser:

- `PUBLIC_VEHICLES_URL`
- `PUBLIC_MT_KEY`
- `PUBLIC_MBTA_API_BASE`
- `PUBLIC_TRACK_PREDICTION_API`

Create `apps/map-web/.env.example`:

```
PUBLIC_VEHICLES_URL=https://imt.ryanwallace.cloud
PUBLIC_MT_KEY=
PUBLIC_MBTA_API_BASE=
PUBLIC_TRACK_PREDICTION_API=
```

In deployment, define these as real env vars (or `.env.production`).

---

## 6) Env Shim (keep TS unchanged)
Create `bostontraintracker/src/src/lib/env-shim.ts`:

```ts
// apps/map-web/src/lib/env-shim.ts
// Bridge Astro/Vite envs to the existing code that reads process.env.*
// This avoids editing the map core TypeScript.

// Ensure window.process exists
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g: any = globalThis as any
if (!g.process) g.process = {}
if (!g.process.env) g.process.env = {}

const m = import.meta.env
Object.assign(g.process.env, {
  NODE_ENV: m.MODE === 'production' ? 'production' : 'development',
  MT_KEY: m.PUBLIC_MT_KEY || '',
  VEHICLES_URL: m.PUBLIC_VEHICLES_URL || '',
  MBTA_API_BASE: m.PUBLIC_MBTA_API_BASE || '',
  TRACK_PREDICTION_API: m.PUBLIC_TRACK_PREDICTION_API || ''
})
```

This lets the existing code continue to read `process.env.MT_KEY`, etc., without modification.

---

## 7) Astro Pages that Load the Core
Create/replace `bostontraintracker/src/src/pages/index.astro` (main map):

```astro
---
// Astro page shell for the main map
---
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Real‑Time Map</title>
    <link rel="preconnect" href="https://tile.openstreetmap.org" />
    <!-- add preconnect to vehicles API origin if distinct -->
  </head>
  <body>
    <div id="app">
      <!-- Provide the container the existing code expects -->
      <div id="map" style="height: 70vh; width: 100%"></div>
    </div>

    <script type="module">
      // Load env shim, then core map code. Defer to idle for quicker first paint.
      const start = async () => {
        // Use absolute /src paths so Vite resolves modules at runtime
        await import("/src/lib/env-shim.ts")
        await import("/src/map-core/map.ts")
      }
      if ('requestIdleCallback' in window) {
        ;(window as any).requestIdleCallback(start)
      } else {
        start()
      }
    </script>
  </body>
  </html>
```

Create `bostontraintracker/src/src/pages/track/[id].astro` (vehicle tracking) and mark as non-prerendered for dynamic params:

```astro
---
export const prerender = false
const { id } = Astro.params
---
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Track {id}</title>
  </head>
  <body>
    <div id="app">
      <div id="map" style="height: 70vh; width: 100%"></div>
    </div>

    <script type="module">
      const start = async () => {
        // Use absolute /src paths so Vite resolves modules at runtime
        await import("/src/lib/env-shim.ts")
        await import("/src/map-core/track.ts")
      }
      if ('requestIdleCallback' in window) {
        ;(window as any).requestIdleCallback(start)
      } else {
        start()
      }
    </script>
  </body>
  </html>
```

Note: The unmodified core code should select `#map` and bootstrap itself as it already does.

---

## 8) Vite/Astro Config
If you need aliases (e.g., to match old Webpack alias for Leaflet), add them in `bostontraintracker/src/astro.config.mjs`:

```js
// apps/map-web/astro.config.mjs
import { defineConfig } from 'astro/config'

export default defineConfig({
  vite: {
    resolve: {
      alias: {
        // replicate prior webpack alias if necessary
        // 'leaflet$': 'leaflet/dist/leaflet.js'
      }
    }
  }
})
```

In most cases, the alias is not required because the core already imports Leaflet CSS explicitly.

---

## 9) Optional: Service Worker / PWA
Existing `sw.ts` can be migrated via `vite-plugin-pwa` or loaded as a standalone module:

Option A (recommended) – `vite-plugin-pwa` in Astro:
- Install: `pnpm add -D vite-plugin-pwa`
- Configure in `astro.config.mjs`:

```js
import { defineConfig } from 'astro/config'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  vite: {
    plugins: [
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg'],
        workbox: { navigateFallbackDenylist: [/^\/track\//] }
      })
    ]
  }
})
```

- Port logic from `apps/map-core/src/sw.ts` into a PWA worker (`src/sw.ts`) or a simple Workbox config.

Option B – Manual registration:
- Build a plain TS worker and register it in a small script in Astro’s pages. Keep this for later if needed.

---

## 10) Performance Improvements (No Core Rewrites)
- Lazy‑load optional heavy libs when toggled:
  - Marker clustering: import `leaflet.markercluster` only when clustering is enabled in the UI.
  - DataTables: import jQuery + DataTables only when the table panel opens.

Example for conditional import (in the core code’s relevant UI handler):

```ts
async function enableTable() {
  const $ = (await import('jquery')).default
  ;(window as any).$ = (window as any).jQuery = $
  await import('datatables.net-dt')
  // then instantiate the table
}
```

- Ensure the map update interval pauses when `document.visibilityState === 'hidden'` to reduce CPU work (the core already trends this way; verify and keep it).
- Add `<link rel="preconnect">` to tiles and API origins in Astro pages.
- Prefer `client:idle` (or the explicit `requestIdleCallback` pattern above) for initial core load.

---

## 11) Styling & UI Shell
- Keep existing Leaflet and plugin CSS imports in the core.
- In Astro, build a clean layout using modern CSS (variables, flex/grid, prefers‑color‑scheme) for headers/footers/panels.
- Avoid re‑implementing map UI in Astro components now—treat the map as an “island” the core code controls.

Later enhancements (optional):
- Convert specific UI pieces (filters, legends, settings) into Astro/Svelte components hydrated on interaction.

---

## 12) Build & Run
From `bostontraintracker/src`:

```
pnpm dev   # start Astro dev server
pnpm build # output to dist/
```

Astro will code‑split and hash assets. Verify map loads and features work.

---

## 13) Deployment (Node SSR)
Run the built Node server behind a reverse proxy. Example Caddy config:

```
bostontraintracker.com {
  encode zstd gzip
  @static path /favicon.svg /robots.txt /assets/* /images/*
  handle @static {
    root * /srv/bostontraintracker/src/dist/client
    file_server
  }
  handle {
    reverse_proxy 127.0.0.1:4321
  }
}
```

Systemd unit example:

```
[Unit]
Description=Boston Train Tracker (Astro SSR)
After=network.target

[Service]
Environment=NODE_ENV=production
Environment=PUBLIC_VEHICLES_URL=
Environment=PUBLIC_MT_KEY=
Environment=PUBLIC_MBTA_API_BASE=
Environment=PUBLIC_TRACK_PREDICTION_API=
WorkingDirectory=/srv/bostontraintracker/src
ExecStart=/usr/bin/node dist/server/entry.mjs
Restart=always

[Install]
WantedBy=multi-user.target
```

Then:

```
pnpm build
PORT=4321 pnpm start
```

---

## 14) CI Pipeline (example with GitHub Actions)
Add a job that builds the Astro app and publishes `dist/` as an artifact or to your server.

```yaml
name: build-map-web
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/map-web
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
        env:
          PUBLIC_VEHICLES_URL: ${{ secrets.PUBLIC_VEHICLES_URL }}
          PUBLIC_MT_KEY: ${{ secrets.PUBLIC_MT_KEY }}
          PUBLIC_MBTA_API_BASE: ${{ secrets.PUBLIC_MBTA_API_BASE }}
          PUBLIC_TRACK_PREDICTION_API: ${{ secrets.PUBLIC_TRACK_PREDICTION_API }}
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
```

Deploy to your host (Fly, Caddy on a VPS, or GitHub Pages). Update Caddy to serve the built files.

---

## 15) Remove Old Hugo Coupling (when ready)
- The old `pnpm run move` script in `ryanwallace.cloud/map/package.json` copied build artifacts into Hugo.
- After the Astro site is live, delete the copy/move step and any Hugo content under `ryanwallace.cloud/content/map/` that is no longer used.

---

## 16) Redirects & Rollout
- If the old site served under `/map/`, add a redirect to the new domain/subpath.
- Test deep links (tracking pages under `/track/[id]`).
- Keep old path serving a simple HTML that redirects (temporary 302 → permanent 301) to preserve SEO.

---

## 17) Validation & Monitoring
- Lighthouse/Pagespeed: verify initial load, interaction latency, and bundle size.
- Runtime errors: add basic client logging for SSE reconnects and map tile errors.
- Error reporting (optional): Sentry or a lightweight logger.

---

## 18) Future Refactors (Optional, Post‑Split)
- Gradually migrate jQuery/DataTables UI pieces to small hydrated components.
- Introduce a shared `@map/core` package if you split into multiple consumers.
- Consolidate service worker with `vite-plugin-pwa` (precaching and runtime caching for tiles/data).
- Convert selected modules to ES modules with explicit exports for better tree‑shaking.

---

## Checklist Summary
- [x] Reuse existing Astro app at `bostontraintracker/src`.
- [x] Copy `ryanwallace.cloud/ryanwallace.cloud/map/src/**` → `bostontraintracker/src/src/map-core/**` (no changes).
- [x] Add deps to `bostontraintracker/src/package.json`.
- [x] Install deps in `bostontraintracker/src`.
- [x] Add `src/lib/env-shim.ts` and use it before loading core modules.
- [x] Implement `src/pages/index.astro` and `src/pages/track/[id].astro` that dynamically import the core.
- [x] Configure envs (`PUBLIC_*`), build, and verify locally.

Verification checklist (local):
- Copy envs: `cp .env.example .env` and set `PUBLIC_VEHICLES_URL`, `PUBLIC_MT_KEY`, etc.
- Dev run: `pnpm dev` → `/` renders map; `/track/123` loads tracking.
- Prod build: `pnpm build && pnpm preview` → sanity‑check both routes.

Install locally (network-restricted in agent environment):

```
cd apps/map-web
pnpm install
cp .env.example .env
pnpm dev
```
- [ ] Add Caddy config for the new site and deploy.
- [ ] Remove old Hugo move/copy logic; add redirects.
- [ ] Optional PWA and further lazy‑loading improvements.

---

## Notes on Minimal Change Guarantees
- The shim ensures `process.env.*` continues to work without modifying core TS.
- Astro/Vite accepts CSS imports in TS/JS and will emit styles correctly.
- Dynamic imports allow you to defer heavy libs without touching unrelated logic.

With this path, you gain a modern build and deployment flow while preserving the map logic you’ve already validated in production.
If using Node SSR (recommended here), configure the Node adapter and a WASM image service to avoid sharp:

```
// astro.config.mjs
import node from '@astrojs/node'
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  image: { service: { entrypoint: 'astro/assets/services/squoosh' } }
})
```

Run the server:

```
pnpm build
PORT=4321 pnpm start
```
