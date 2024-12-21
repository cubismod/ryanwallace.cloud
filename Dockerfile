ARG caddy_version=2.9

FROM caddy:$caddy_version-builder AS caddy-builder

RUN xcaddy build \
     --with github.com/caddyserver/cache-handler

FROM hugomods/hugo:0.140.0 AS builder
WORKDIR /build
ADD ryanwallace.cloud .

RUN hugo build --cleanDestinationDir --minify --gc

FROM caddy:$caddy_version AS server
COPY --from=caddy-builder /usr/bin/caddy /usr/bin/caddy
WORKDIR /var/www/html

COPY --from=builder /build/public/ .
ADD Caddyfile /etc/caddy/Caddyfile
