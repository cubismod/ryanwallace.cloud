# Map/Tracking Site — Planning and Architecture (Next.js 15 + shadcn/ui + Tailwind v4)

This document is the single source of truth for creating a new, dedicated mapping/tracking website from the custom code currently living in `ryanwallace.cloud/map/src/`. It guides both me (as the primary user) and future Codex/Claude/Other LLM sessions to plan, build, migrate, and maintain the site with clarity and repeatability.

Goals:

- Build a clean, maintainable public transit tracker for Greater Boston.
- Use Next.js 15 (App Router), React Server Components (RSC), and Server Actions where helpful.
- Use shadcn/ui with Tailwind CSS v4 for a consistent, accessible design system.
- Migrate existing live vehicle, alerts, and prediction logic into well-structured modules.
- Prioritize fast, reliable user-facing info over developer features.

---

## 1) Scope and Outcomes

- Primary audience: Greater Boston riders and transit enthusiasts.
- Core flows:
  - Live vehicle tracking on a performant city map (buses, subway, commuter rail as available).
  - Real-time track predictions at major stations (experimental).
  - System alerts and advisories, filterable by line/route and severity.
  - Route and stop pages with current status, vehicles en route, and upcoming trips.
  - Optional favorites (routes/stops) for quick access; no account required.
- Non-goals for MVP: developer exports (GPX/FIT/TCX), activity history tools, general-purpose APIs.

Success criteria:

- MVP deploys easily and updates in real time with low latency.
- Map rendering is smooth with many vehicles and frequent updates.
- Predictions and alerts are accurate, timely, and clearly presented.
- Existing code in `ryanwallace.cloud/map/src/` for live tracking/alerts is migrated or replaced cleanly.

---

## 2) Tech Stack

- Framework: Next.js 15 (App Router), TypeScript, RSC + Server Actions.
- UI: shadcn/ui components; Tailwind CSS v4; Radix primitives.
- Mapping: Leaflet (reuse existing code), using Mapbox vector tiles.
- State: RSC for data fetching + small client stores for map state and favorites.
- Data source: https://imt.ryanwallace.cloud/openapi.json.
  - This backend is already established and consolidates MBTA V3 API data into a domain-specific format for my usages.
  - Source code: https://github.com/cubismod/inky-mbta-tracker
- Caching: Next.js fetch cache and optional Redis (Fly Redis or Upstash) for burst resilience.
- Validation: `zod` for schemas and defensive parsing.
- Testing: Vitest (unit), Playwright (E2E), Testing Library (components).
- Deployment: Fly.io.

---

## 3) Repository Strategy

Option A — Separate repo (recommended for clarity):

- New repo: `map.ryanwallace.cloud` (or `maps.ryanwallace.cloud`).
- Benefits: clear boundaries, no accidental coupling with the main site.

Option B — Monorepo (if shared code is substantial):

- Structure:
  - `apps/web` → new map site (Next.js 15)
  - `apps/main-site` → current site
  - `packages/map-core` → transit domain types, provider clients, headway utilities
  - `packages/ui` → shared components (if needed)

Either way, a `packages/map-core` module is recommended to encapsulate transit domain logic (providers, mappers, prediction/headway utilities).

---

## 4) High-Level Architecture

- RSC-first UI; client components for the interactive map and live widgets only.
- Data providers to fetch MBTA vehicles, predictions, alerts, routes/stops, and shapes.
- Caching and normalization layer to coalesce frequent polls into consistent snapshots.
- Real-time delivery via SSE or polling with HTTP caching; background refresh with revalidation.
- `MapProvider` encapsulates Leaflet setup and vehicle/route/stop layers.
- Route Handlers (`app/api/*`) expose minimal endpoints if needed for SSE or controlled caching.

---

## 5) Project Setup (Step-by-Step)

Scaffold Next.js 15 app with Tailwind v4 and shadcn/ui.

1. Create project

```bash
# choose your package manager; examples use pnpm
pnpm dlx create-next-app@latest map-site \
  --ts --eslint --app --src-dir --no-tailwind --import-alias "@/*"
cd map-site
```

2. Add Tailwind v4

```bash
pnpm add -D tailwindcss postcss autoprefixer

# postcss.config.mjs
```

```js
// postcss.config.mjs
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

export default {
  plugins: [tailwindcss, autoprefixer],
};
```

```css
/* src/app/globals.css */
@import "tailwindcss";

/* Optional: your CSS variables and base tokens */
:root {
  --radius: 0.5rem;
}
```

```ts
// tailwind.config.ts (v4 — config optional, include if customizing)
import type { Config } from "tailwindcss";

export default {
  content: ["./src/app/**/*.{ts,tsx,mdx}", "./src/components/**/*.{ts,tsx}"],
} satisfies Config;
```

3. Initialize shadcn/ui (Tailwind v4)

```bash
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add "button card input label dropdown-menu dialog sonner separator tabs tooltip badge sheet progress toggle checkbox"
```

4. Add base utilities

```bash
pnpm add zod zustand leaflet
pnpm add -D @types/leaflet vitest @testing-library/react @testing-library/jest-dom jsdom playwright @playwright/test
```

5. App Router skeleton (with `--src-dir`)

Two primary pages for MVP: a live map and a commuter rail track predictor. Each page is based on the existing HTML sources in this repo.

- Map page source: `ryanwallace.cloud/map/src/index.html` (and its `map.ts` module)
- Track page source: `ryanwallace.cloud/content/track/index.html` (and its `/map/track.js` module)

```
src/
  app/
    layout.tsx
    page.tsx            # Home (hero + embedded map)
    map/page.tsx        # Live interactive map (reuse map HTML + TS)
    track/page.tsx      # CR track predictions (reuse track HTML + JS)
    api/
      vehicles/route.ts     # Optional SSE/poll proxy with caching
      predictions/route.ts  # Optional cache-normalized predictions
      alerts/route.ts       # Optional cache-normalized alerts
  components/             # UI + map widgets
    map/                  # map components including leaflet
    elf/                  # elf related logic
    alerts/               # alert components including datatables
    predictions/          # components for displaying predictions
  lib/                    # providers, cache, schemas, utils
```

---

## 5a) Folder Organization (Next.js conventions)

High-level folders for a Next.js App Router project. If you used `--src-dir`, prepend `src/` to these (for example, `src/app`, `src/lib`). No specific filenames yet — just where categories of logic live.

Top-level:

- `app/`: route segments and server entry (RSC-first)
- `components/`: reusable UI and client-side widgets
- `lib/`: domain logic, providers, transforms, state, and utilities
- `public/`: static assets (icons, images, worker bundles if needed)
- `styles/` (optional): non-Tailwind CSS modules or tokens
- `tests/` and `e2e/`: unit and Playwright tests

Inside `app/`:

- `layout` and `page` for root
- `map/` and `track/` route segments (MVP)
- `routes/[id]/` and `stops/[id]/` for detail pages
- `api/` for any proxy/caching handlers (vehicles, predictions, alerts, sse)

Inside `components/`:

- `map/`: Leaflet host, layer toggles, vehicle overlays, HUD
- `alerts/`: banners, list/table views, severity chips
- `predictions/`: arrivals/headway widgets and tables
- `track/`: commuter-rail track-specific widgets
- `common/`: shared UI primitives that are not part of shadcn/ui

Inside `lib/`:

- `core/`: domain types, zod schemas, constants (colors, route metadata)
- `providers/`: API client(s) for IMT/MBTA and any Amtrak/Overpass sources
- `transforms/`: mappers/normalizers and headway/status derivations
- `cache/`: fetch wrappers, revalidate helpers, optional Redis bindings
- `map/`: geometry helpers, clustering, color/bearing utilities
- `stores/`: small client stores (map UI state, favorites) via Zustand
- `utils/`: generic utilities (time/date, formatting, connection detection)
- `workers/` (optional): web worker sources that are built and imported via bundler

Mapping existing `ryanwallace.cloud/map/src/` logic to folders:

- Map rendering glue (map initialization, layer wiring): `components/map/`
- Marker and layer management, vehicle counters/HUD: `components/map/` (+ pure geometry/color helpers in `lib/map/`)
- Alerts/predictions UI tables and chips: `components/alerts/` and `components/predictions/`
- Domain and provider logic (alerts, vehicles, predictions, Amtrak): `lib/providers/`, `lib/transforms/`, `lib/core/`
- Geometry utilities and line/shape helpers: `lib/map/`
- Overpass-related parsing and background work: `lib/workers/` (or `public/` if shipping a plain worker bundle)
- Connection/online detection and general helpers: `lib/utils/`
- “Elf” scoring or metrics logic: `lib/transforms/` (UI in `components/` if needed)

Notes:

- Keep UI in `components/*` and pure logic in `lib/*` to enable reuse from server and client.
- Prefer server data fetching in route segments; only move to `app/api/*` when proxying/caching is beneficial.
- If you later adopt a monorepo, lift `lib/core`, `lib/providers`, and `lib/transforms` into a `packages/map-core` package and re-export to the app.

---

## 5b) Import Aliases (`@/`)

Use `@/` to refer to `src/` everywhere to avoid brittle relative paths. `create-next-app` was initialized with `--import-alias "@/*"`, which configures `tsconfig.json` like this:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

Alias usage examples:

- `@/app/(routes)/map/page` — route modules
- `@/components/map/MapProvider` — UI widgets and client components
- `@/lib/core/types` — domain types and constants
- `@/lib/providers/imt` — API clients
- `@/lib/transforms/headways` — normalization and derivations
- `@/lib/map/geometry` — geometry helpers
- `@/lib/utils/time` — generic utilities
- `@/lib/stores/map` — lightweight client stores

Sample imports:

```ts
import { MapProvider } from "@/components/map/MapProvider";
import { fetchVehicles } from "@/lib/providers/imt";
import { computeHeadways } from "@/lib/transforms/headways";
```

Notes:

- Keep imports stable with `@/…` across server and client files.
- Avoid deep `../../..` relative paths; prefer the alias for clarity.

---

## 5c) Next.js Best Practices

App Router and RSC

- RSC-first: prefer server components; add `"use client"` only for interactive leaf nodes (map, toggles, HUD).
- Co-location: route code in `src/app/**`, reusable UI in `src/components/**`, domain logic in `src/lib/**`.
- Conventions: add `loading.tsx`, `error.tsx`, and `not-found.tsx` per segment where useful.
- Typed Routes: enable Next 15 typed routes; prefer `Link` over imperative navigation.

Data and Caching

- Fetch on the server: call providers in RSC or Route Handlers; use `fetch` options (`revalidate`, `next: { tags }`).
- Revalidate: call `revalidateTag`/`revalidatePath` from Server Actions or admin tools when refreshing cache.
- Dynamics: opt into `export const dynamic = 'force-dynamic'` only when bypassing cache is necessary.
- Runtime: set `export const runtime = 'nodejs'` for SSE/streams; `edge` for simple, latency-sensitive handlers.

Client Components

- Dynamic import heavy libs (Leaflet) with `ssr: false`; scope to `/map` pages.
- Keep client state minimal; prefer `searchParams` and server data; use Zustand only for UI-local state.
- Use `Suspense` to stream server-rendered parts; keep boundaries small and purposeful.

API Route Handlers (`src/app/api/*`)

- Validate inputs with `zod`; return typed JSON; small, focused handlers.
- Set `Cache-Control` and tag responses; avoid duplicating server fetch logic already handled in RSC.
- For SSE: heartbeat regularly, handle disconnects, guard with Node runtime.

Performance

- Minimize `use client` surface area and avoid importing server-only modules into client files.
- Code split with `dynamic()` for infrequently used UI; group by route segment.
- Fonts via `next/font`; images via `next/image`.
- Map perf: reuse markers, update with `setLatLng`, throttle to ~1–2s, prefer Canvas rendering.

Routing and SEO

- `generateMetadata` per route; set base metadata in root `layout.tsx`.
- Use `generateStaticParams` for highly trafficked static pages if applicable.
- Let `Link` prefetch by default; disable prefetch on highly dynamic routes where wasteful.

Security

- Validate all external inputs with `zod` at edges (Route Handlers, Server Actions).
- Configure CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `Permissions-Policy`.
- Validate `process.env` at boot via schema; never expose secrets to client.

Styling

- Tailwind v4 with small globals; CSS variables for tokens.
- Use `clsx` + `tailwind-merge` for class composition.
- Keep shadcn/ui wrappers minimal and accessible.

Errors and Observability

- Add granular `error.tsx` per segment; `global-error.tsx` at app root.
- Structured server logs; add `instrumentation.ts` if you wire Sentry/OTLP.
- Clearly show timestamps when UI renders stale-but-valid cached data.

DX and Testing

- Use `@/*` alias everywhere; lint with `eslint-config-next` and add rules to prevent client→server-only imports.
- Unit test pure logic in `src/lib/**`; component test client widgets; Playwright smoke tests for `/map`, alerts, and `/stops/[id]`.

---

## 5d) ESLint Rule Suggestions

Dependencies

- `eslint`, `eslint-config-next` (or `@next/eslint-plugin-next`), `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`
- `eslint-plugin-import`, `eslint-import-resolver-typescript`, `eslint-plugin-promise`
- Optional: `eslint-plugin-boundaries` for architectural layering

Baseline config (`.eslintrc.json`)

```json
{
  "root": true,
  "extends": [
    "next/core-web-vitals",
    "plugin:@typescript-eslint/recommended",
    "plugin:import/recommended",
    "plugin:import/typescript",
    "plugin:promise/recommended"
  ],
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint", "import", "promise"],
  "settings": {
    "import/resolver": {
      "typescript": {
        "alwaysTryTypes": true,
        "project": true
      }
    }
  },
  "rules": {
    "import/order": [
      "error",
      {
        "groups": [
          ["builtin", "external"],
          ["internal", "parent", "sibling", "index"],
          ["type"]
        ],
        "pathGroups": [
          { "pattern": "@/**", "group": "internal", "position": "before" }
        ],
        "newlines-between": "always",
        "alphabetize": { "order": "asc", "caseInsensitive": true }
      }
    ],
    "import/no-unresolved": "error",
    "@typescript-eslint/consistent-type-imports": ["error", { "prefer": "type-imports" }],
    "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
    "no-restricted-imports": [
      "error",
      {
        "patterns": [
          {
            "group": ["@/lib/server/**"],
            "message": "Do not import server-only modules into client components."
          }
        ]
      }
    ]
  },
  "overrides": [
    {
      "files": ["src/components/**/*.{ts,tsx}", "src/**/?(*.)client.{ts,tsx}"],
      "rules": {
        "no-restricted-imports": [
          "error",
          {
            "patterns": [
              { "group": ["@/lib/server/**"], "message": "Server-only modules are not allowed in client code." }
            ]
          }
        ]
      }
    },
    {
      "files": ["src/lib/**", "src/app/api/**"],
      "rules": {
        "no-console": ["warn", { "allow": ["warn", "error"] }]
      }
    }
  ]
}
```

Layering (optional, via `eslint-plugin-boundaries`)

- Define layers: `app` (routes), `components` (UI), `lib` (domain), `lib/server` (server-only).
- Forbid cross-layer leaks (e.g., `components` importing from `app`, or client importing `lib/server`).

Runtime guards (complement to ESLint)

- Import `server-only` in `src/lib/server/**` modules to throw if they reach the client.
- Import `client-only` in client-only modules that should never be imported by the server.

---

## 6) Domain Model and Types

- Entities
  - `Vehicle` { id, label, routeId, tripId?, directionId, lat, lon, bearing?, speed?, updatedAt, status? }
  - `Prediction` { stopId, routeId, tripId?, arrivalTime?, departureTime?, headwaySec?, uncertaintySec?, status }
  - `Alert` { id, effect, cause, severity, header, description?, informedEntities: { routeId?, stopId?, directionId? }[], activePeriod[] }
  - `Route` { id, type, shortName, longName, color, textColor }
  - `Stop` { id, name, lat, lon, zone?, routes[] }
  - `Shape` { id, coordinates: [lon,lat][], bbox }
  - `TileSource` { name, url, attribution }
- Schemas via `zod`; normalize MBTA API responses to internal shapes.
- Derivations: per-route headways, on-time status, vehicle clustering keys.

---

## 7) Data Providers and Caching

Create provider interfaces for each data group and keep caching centralized.

```ts
// lib/providers/types.ts
export interface TransitProvider {
  vehicles(params?: { routeId?: string }): Promise<Vehicle[]>;
  predictions(params: {
    stopId?: string;
    routeId?: string;
  }): Promise<Prediction[]>;
  alerts(): Promise<Alert[]>;
  routes(): Promise<Route[]>;
  stops(params?: { routeId?: string }): Promise<Stop[]>;
  shapes(params: { routeId: string }): Promise<Shape[]>;
}
```

- Source: https://imt.ryanwallace.cloud/openapi.json.
- Caching: short TTL (e.g., 5–15s) for vehicles/predictions; longer for routes/stops/shapes.
- Backoff: exponential on provider errors; surface stale-but-valid data with warnings.
- Optional store: Redis/Vercel KV for bursts and SSE fanout; otherwise rely on Next.js cache/revalidate.

---

## 8) Mapping Layer

- Leaflet as the mapping engine; reuse existing map code where possible.
- `MapProvider` wraps Leaflet init; child components register layers.
- Layers:
  - Base tiles: Mapbox Vector Tiles (MVT) with attribution.
  - Route polylines: colored by line, split by direction; reuse existing shape rendering.
  - Vehicles: `L.CircleMarker` or icons with rotation; lateness/status color mapping.
  - Stops: interactive markers; show arrival chips on hover/click.
  - Alerts overlays: badges or corridor highlights when active.
- Performance tactics:
  - Prefer `preferCanvas: true`; batch updates and reuse marker instances (`setLatLng`).
  - Throttle updates to ~1–2s cadence; coalesce provider polls.
  - Use simplified polylines for overview zooms; load detailed shapes on demand.

---

## 9) UI and Theming (shadcn/ui)

- Use a base theme and tokens. Keep light/dark modes.
- Shared primitives: `Button`, `Card`, `Dialog`, `DropdownMenu`, `Tabs`, `Tooltip`, `Sheet`.
- Map UI widgets:
  - `LayerToggle` (checklist of layers)
  - `MapHUD` (scale, coords, current zoom)
  - `RouteLegend` (colors and line badges)
  - `AlertBadge` (severity/status)
- Keep components client-only only when needed; prefer server components elsewhere.

---

## 10) Routes and Features

- `/`: homepage with an accessible hero describing the app (what it tracks, coverage, freshness) and an embedded map component. The map is interactive but sized for the homepage; include a clear CTA to open the full-screen `/map` view. Add highlight cards (Vehicles, Predictions, Alerts) with live counts.
- `/map`: full-screen/live vehicle map based on `ryanwallace.cloud/map/src/index.html` (refresh rate, follow-location toggle, vehicle counts, alerts table, optional “Elf” UI).
- `/track`: commuter rail track predictions based on `ryanwallace.cloud/content/track/index.html` (stats header + predictions table).

APIs (`app/api/*`) — optional, only if proxying/caching is beneficial:

- `GET /api/vehicles` → cached snapshot of vehicles (supports `routeId`).
- `GET /api/predictions` → cached snapshot for stop/route queries.
- `GET /api/alerts` → cached alerts.
- `GET /api/sse` → SSE stream of snapshots (fanout from cache).

---

## 10a) Homepage (Hero + Embedded Map)

Purpose

- Improve first impression, SEO, and navigation by presenting a clear value proposition and a live, embedded map on `/`.

Composition

- Hero section: concise H1 (“Unofficial real-time transit for Greater Boston”), supporting copy (what’s covered and freshness), primary CTA (“Open full map”), secondary CTA (“See alerts”).
- Embedded map: use the same `MapProvider` but with a contained height (e.g., 60–70vh) and responsive layout. Include minimal controls (zoom, locate) and a route filter chip group. Provide a visible link/button to open `/map`.
- Live stats: small cards showing counts (vehicles online, active alerts, average headway).
- SEO elements: `generateMetadata` with descriptive title/description; OG/Twitter metadata and `opengraph-image.tsx` for a branded preview. Optional JSON-LD (`WebApplication`) with name, description, and URL.

Implementation Notes

- Componentization: build `HomeHero`, `HomeStats`, and `HomeMapEmbed` in `src/components/home/` and use them from `src/app/page.tsx`.
- Map embed: lazy-load the Leaflet client bundle (`dynamic(..., { ssr: false })`) and defer rendering until in-viewport (IntersectionObserver) to reduce TTFB and CPU usage.
- Data fetching: fetch counts on the server (RSC) with short revalidate windows; pass to client widgets as props.
- Accessibility: ensure color contrast, visible focus states, and keyboard access to map controls; include “Skip to map” link.
- Performance: throttle marker updates (~1–2s); pause updates when the tab is hidden; prefer Canvas rendering.

Navigation

- Prominent CTA to `/map` (full-screen), secondary links to `/routes`, and `/track` as the site grows.

---

## 11) Auth, Legal, and Privacy

- MVP: public, sessionless; no signup. Favorites stored locally.
- Optional: lightweight auth if you later add server-side favorites.
- Legal: avoid using MBTA trademarks in names/domains; include “Unofficial” disclaimer.
- Privacy: no PII collection; respect provider ToS and rate limits.

---

## 12) Real-Time Data Ingestion

- Providers: MBTA vehicles, trip updates/predictions, alerts, routes/stops, shapes.
- Strategy: Poll provider endpoints on short intervals with staggered schedules.
- Normalization: map raw responses to internal types; compute headways and status.
- Caching: expose consistent snapshots to the UI (SWR-friendly, SSE-friendly).
- Resilience: backoff, circuit-breaker, and stale-while-revalidate presentation.

---

## 13) Real-Time Updates and Notifications

- Delivery: SSE endpoint for continuous updates or client polling with HTTP caching.
- UI: live badges and subtle motion for vehicle movement; clear timestamps.
- Optional: Web Push for major alerts affecting saved favorites.
- Throttling: coalesce updates to ~1–2s cadence to reduce churn.

---

## 14) Testing Strategy

- Unit: provider mappers, schema validation, headway calculators.
- Component: map widgets (mock provider), alert banners, arrivals list.
- E2E: Playwright — open /map, filter routes, view /stops/[id] predictions, check alerts.
- Performance: benchmark provider polling and map rendering with many vehicles.

---

## 15) Performance and DX

- RSC for lists and summaries; client components only for map.
- Memoize derived geometry; cache server-side computations.
- Use `next/font` for fast fonts; image optimization minimal.
- Strict TypeScript; ESLint; Prettier. Keep CI fast.

---

## 16) Deployment (Fly.io — chosen)

- Containerized Next.js app using standalone output; deploy on Fly Machines.
- Steps:
  - Next config: enable `output: 'standalone'` in `next.config.ts`.
  - Dockerfile: multi-stage build; copy `.next/standalone`, `.next/static`, and `public/` into final image; set `PORT=3000`, `HOSTNAME=0.0.0.0`; `CMD ["node", "server.js"]` from the standalone output directory.
  - fly.toml: set `internal_port = 3000`, health checks on `/` (or `/status` if added), `min_machines_running = 1`, `auto_stop_machines = 'stop'`, `auto_start_machines = true`, `primary_region = 'bos'`.
  - Secrets/env: `fly secrets set IMT_API_BASE=...` (and any tokens); keep secrets out of the image.
  - Scaling: start with `shared-cpu-1x`; optionally add a Redis add-on (Fly Redis/Upstash) if using server-side caching.
  - Domains/TLS: attach your domain (`map.ryanwallace.cloud`) via `flyctl certs add` (Fly manages TLS automatically).
  - Observability: enable logs and consider Sentry/OTLP exporters; tune health check intervals/timeouts.

- Optional: If you later split static assets, you can front them with Fly’s CDN and continue to run the Next server for SSR/API.

Examples (copy/paste):

```Dockerfile
# Dockerfile — Next.js standalone on Fly.io
FROM node:22-slim AS builder
WORKDIR /app

# Install deps
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile

# Build (requires next.config.ts with output: 'standalone')
COPY . .
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Copy standalone output and assets
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
```

```toml
# fly.toml — Next.js server on port 3000
app = "map-ryanwallace-cloud"
primary_region = "bos"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 1
  processes = ["app"]

  [http_service.concurrency]
    type = "requests"
    soft_limit = 50
    hard_limit = 80

[[http_service.checks]]
  interval = "30s"
  timeout = "5s"
  method = "GET"
  path = "/"

[[vm]]
  size = "shared-cpu-1x"
```

---

## 17) Migration Plan from `ryanwallace.cloud/map/src/`

1. Inventory existing modules related to: live vehicle polling, alert handling, prediction logic, map rendering, and utilities.
2. Extract reusable logic into `packages/map-core`:
   - Domain types, provider clients, normalizers, headway calculators, color/status mapping.
3. Implement `MapProvider` + vehicle/route/stop layers; replace legacy map glue with components.
4. Port UI to shadcn/ui equivalents; maintain keyboard/accessibility standards.
5. Validate feature parity for MVP: live vehicles on /map, stop arrivals, route view, alerts.
6. Compare outputs from old and new flows for consistency; fix deltas.
7. Remove or archive legacy code once parity is met.

---

## 18) Security, Privacy, and Backup

- Public site; no PII. Rate-limit server endpoints.
- Respect provider ToS; set polite polling intervals and caching headers.
- If using Redis/KV, back up configuration; no sensitive data stored.
- Log minimal diagnostics; avoid storing user IPs or identifiers.

---

## 19) Observability

- Minimal server logs for API calls and cache events.
- Prometheus metrics.

---

## 20) Maintenance and Workflow

- Branch per feature; small PRs.

---

## 21) Milestones & Checklists

MVP (public):

- [ ] Scaffold Next.js 15 app with Tailwind v4 and shadcn/ui
- [ ] Add `MapProvider` (MapLibre) and base layers
- [ ] Provider client for vehicles/predictions/alerts with caching
- [ ] `/map` with live vehicles + route filter + alerts banner
- [ ] `/stops/[id]` arrivals board with predictions and headways
- [ ] `/routes/[id]` with vehicles, shapes, and headway overview
- [ ] Basic theming and responsive layout
- [ ] Deploy to chosen domain with caching tuned

V1 polish:

- [ ] SSE endpoint and client stream for smoother updates
- [ ] Favorites (client-only) and quick-access panel
- [ ] Enhanced alert filtering and severity highlighting
- [ ] Performance profiling with many vehicles
- [ ] E2E tests for core flows

Future ideas:

- [ ] Web Push for major alerts on favorites
- [ ] Route performance dashboards (on-time stats)
- [ ] Offline tile fallback for map baselayer

---

## 22) Example Snippets

Leaflet map provider sketch (client component):

```tsx
// src/components/map/MapProvider.tsx
"use client";
import { useEffect, useRef } from "react";
import L, { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";

export function MapProvider({ children }: { children?: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      preferCanvas: true,
      zoomControl: true,
      center: [42.3601, -71.0589], // Boston
      zoom: 12,
    });
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 19,
      },
    ).addTo(map);
    mapRef.current = map;
    return () => map.remove();
  }, []);

  return (
    <div className="relative w-full h-[calc(100dvh-56px)]">
      <div ref={containerRef} className="absolute inset-0" />
      {children}
    </div>
  );
}
```

SSE snapshot route sketch:

```ts
// src/app/api/sse/route.ts
import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      const interval = setInterval(async () => {
        const [vehicles, predictions, alerts] = await Promise.all([
          fetchCachedVehicles(),
          fetchCachedPredictions(),
          fetchCachedAlerts(),
        ]);
        send("snapshot", { vehicles, predictions, alerts, ts: Date.now() });
      }, 1500);
      return () => clearInterval(interval);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

---

## 23) Notes for Future Codex/Claude/Other LLM Sessions

- Always consult this doc before implementing changes. Update it if plans change.
- Prefer small, well-scoped PRs. Avoid mixing migration with new features.
- When you touch map logic, keep it behind `packages/map-core` boundaries.
- If you add a dependency, state why in this doc’s changelog section.

Changelog (append entries here):

- 2025-08-16: Initial plan drafted for Next.js 15 + Tailwind v4 + shadcn/ui.

---

## 24) Quick Start (once repo exists)

```bash
pnpm install
pnpm dev
# open http://localhost:3000
```

Deploy to Fly.io

```bash
fly launch --no-deploy   # or create fly.toml manually from the example
fly secrets set IMT_API_BASE=https://imt.ryanwallace.cloud
fly deploy
```

---

## 25) Name Candidates (Notes)

No decision yet; select after domain and handle checks.

- Boston Headways
  - Positioning: Rider-first, descriptive; clear to transit fans.
  - Tone: Formal, public-facing.
  - Tagline: Unofficial real-time headways for Greater Boston.
  - Domain ideas: bostonheadways.app, bostonheadways.io, bostonheadways.live.
  - Notes: “Headways” is jargon to some; strong SEO and clarity.

- Boston Transit Monitors
  - Positioning: Authoritative vehicle/system status and headways.
  - Tone: Formal, technical.
  - Tagline: Unofficial real-time vehicle and headway monitor.
  - Domain ideas: bostontransitmonitor.com, bostontransitmonitor.app (singular variant also viable: “Boston Transit Monitor”).
  - Notes: Longer name; consider “BTM” abbreviation in UI; keep “Unofficial” disclaimer prominent.

Decision checklist:

- [ ] Check domain availability and social handles for both.
- [ ] Quick trademark/common-law sweep for conflicts.
      +- [ ] Draft minimal wordmarks (SVG) and favicon set; test legibility.
- [ ] Choose finalist; register domain; add footer disclaimer.

Assets drafted (initial wordmarks):

- docs/branding/boston-headways-wordmark.svg
- docs/branding/boston-transit-monitors-wordmark.svg
