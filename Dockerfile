ARG caddy_version=2.10@sha256:30ccf0cb027e1d06cd6e453c04fc1c8eec665629b22ed69602c14c8a0512ead0
ARG caddy_builder_version=2.10-builder@sha256:9edca605c07c8b5425d1985b4d4a1796329b11c3eba0b55f938e01916dcd96c8

# node bundling
FROM node:23.11.0@sha256:ee8a0bc5bbaece0c538c76e7c20fde6d4db319bbd5d4e423940999f16da89aa1 as node

WORKDIR /build
ADD ryanwallace.cloud .
WORKDIR /build/map
RUN yarn
# https://fly.io/docs/apps/build-secrets/
RUN --mount=type=secret,id=MT_KEY \
     MT_KEY="$(cat /run/secrets/MT_KEY)" yarn build && yarn move && yarn title

# hugo build
FROM hugomods/hugo:0.147.6@sha256:11f9c2ed8d720fa347c79951c686e3834f750b52956475c2ecb923f9730c1388 AS builder
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
