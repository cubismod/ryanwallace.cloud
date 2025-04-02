ARG caddy_version=2.9@sha256:cd261fc62394f1ff0b44f16eb1d202b4e71d5365c9ec866a4f1a9c5a52da9352
ARG caddy_builder_version=2.9-builder@sha256:2223a2b14c52cd3d6054cbb97b14d57e9ae6b06d5fe3f72102bd50be01adca88

# node bundling
FROM node:23.11.0@sha256:047d633b358c33f900110efff70b4f1c73d066dec92dd6941c42d26889f69a0e as node

WORKDIR /build
ADD ryanwallace.cloud .
WORKDIR /build/map
RUN yarn
# https://fly.io/docs/apps/build-secrets/
RUN --mount=type=secret,id=MT_KEY \
     MT_KEY="$(cat /run/secrets/MT_KEY)" yarn build && yarn move && yarn title

# hugo build
FROM hugomods/hugo:0.145.0@sha256:879cf9ff9c411cf9a2904d466bedcac1f26a8c09fcdb663ca90dcf94a47f49cb AS builder
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
