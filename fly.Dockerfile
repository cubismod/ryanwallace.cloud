ARG caddy_version=2.10@sha256:9e95012adcbbd599f853cb315b986781845c238f9e52aa3652798758cca01422
ARG caddy_builder_version=2.10-builder@sha256:53f91ad7c5f1ab9a607953199b7c1e10920c570ae002aef913d68ed7464fb19f


# node bundling
FROM node:24.10.0@sha256:06e54ecf113a30f0ff9a1d309866a5924d3bda4389eab11a0e1e92f3251d915d as node

WORKDIR /build
ADD ryanwallace.cloud .
WORKDIR /build/map

ENV DISABLE_OVERPASS=true
ENV NODE_ENV=production
# Build-time environment variables for Vite
ARG VEHICLES_URL="https://imt.ryanwallace.cloud"
ARG MBTA_API_BASE=""
ARG TRACK_PREDICTION_API="https://imt.ryanwallace.cloud"
ARG BOS_URL="https://bos.ryanwallace.cloud"

ENV VEHICLES_URL=${VEHICLES_URL}
ENV MBTA_API_BASE=${MBTA_API_BASE}
ENV TRACK_PREDICTION_API=${TRACK_PREDICTION_API}
ENV BOS_URL=${BOS_URL}

# Enable pnpm via corepack and install deps
RUN corepack enable && corepack prepare pnpm@10.18.0 --activate && pnpm install --frozen-lockfile=false --force
# https://fly.io/docs/apps/build-secrets/
RUN --mount=type=secret,id=MT_KEY \
    MT_KEY="$(cat /run/secrets/MT_KEY)" pnpm build && pnpm move && pnpm title && pnpm title:alerts && pnpm title:track

# hugo build
FROM hugomods/hugo:0.152.1@sha256:7407fcffec7e59e5730990d7c39b471aea116279b5476236b60bb2e5d18357c4 AS builder
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
