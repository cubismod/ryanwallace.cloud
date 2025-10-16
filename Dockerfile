ARG caddy_version=2.10@sha256:786b7527345b82faf39e664ea26c71cc57bcb3a89bb2eada94bf0b2dc5304f0a
ARG caddy_builder_version=2.10-builder@sha256:3c5f636b41a6772c66b45f2a62ef1e2bac9c9f80dc12ea097cdb1b4dc5a80048


# node bundling
FROM node:24.10.0@sha256:377f1c17906eb5a145c34000247faa486bece16386b77eedd5a236335025c2ef as node

WORKDIR /build
ADD ryanwallace.cloud .
WORKDIR /build/map

ENV DISABLE_OVERPASS=true
ENV NODE_ENV=production

# Build-time environment variables for Vite
ARG MT_KEY=""
ARG VEHICLES_URL="https://imt.ryanwallace.cloud"
ARG MBTA_API_BASE=""
ARG TRACK_PREDICTION_API="https://imt.ryanwallace.cloud"
ARG BOS_URL="https://bos.ryanwallace.cloud"

ENV MT_KEY=${MT_KEY}
ENV VEHICLES_URL=${VEHICLES_URL}
ENV MBTA_API_BASE=${MBTA_API_BASE}
ENV TRACK_PREDICTION_API=${TRACK_PREDICTION_API}
ENV BOS_URL=${BOS_URL}

# Enable pnpm via corepack and install deps
RUN corepack enable && corepack prepare pnpm@10.18.0 --activate && pnpm install --frozen-lockfile=false --force
# https://fly.io/docs/apps/build-secrets/
RUN pnpm build && pnpm move && pnpm title && pnpm title:alerts && pnpm title:track

# hugo build
FROM hugomods/hugo:0.151.1@sha256:d5681868dafefbb2870763a97da31b08b975d15c22c09d4e5847ce98bf5371e3 AS builder
WORKDIR /build

COPY --from=node /build .

RUN hugo build --cleanDestinationDir --minify --gc

# build caddy extension
FROM caddy:$caddy_builder_version AS caddy-builder

RUN xcaddy build \
     --with github.com/caddyserver/cache-handler

# final image
FROM caddy:$caddy_version AS server
COPY --from=caddy-builder /usr/bin/caddy /usr/bin/caddy
WORKDIR /var/www/html

COPY --from=builder /build/public/ .
ADD Caddyfile /etc/caddy/Caddyfile
