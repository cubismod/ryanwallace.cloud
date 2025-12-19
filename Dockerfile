ARG caddy_version=2.11@sha256:80ebbf75eed465e30dc532cf359df21465ae5f6ab827a2218435e36a030d1bc7
ARG caddy_builder_version=2.11-builder@sha256:79fb68a64999c771efa3254d8affc85427ee25810844cab341cca6636d9d657d


# node bundling
FROM node:24.12.0@sha256:20988bcdc6dc76690023eb2505dd273bdeefddcd0bde4bfd1efe4ebf8707f747 as node

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
FROM hugomods/hugo:0.152.2@sha256:3a677acd4cdfd7754f6209e7c3389231afef7278e5c1c0c0ac82639205f3b845 AS builder
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
