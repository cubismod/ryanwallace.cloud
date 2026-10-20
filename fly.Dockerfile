ARG caddy_version=2.11@sha256:685ae3d7c34d9b5f8caeddc5d14051db7bbd88ff1f5a2fa0c16bd8ca328fb7af
ARG caddy_builder_version=2.11-builder@sha256:8910fe662f448b860e8d16ef1c9a4f8946d3193bdc3e971bf0c55c9a2cf246f6

# hugo build
FROM hugomods/hugo:0.165.0@sha256:cf1a2009a1edf807d0880af344c4dd13b40b308c340501128fb54e5aab17b009 AS builder
WORKDIR /build

ADD ryanwallace.cloud .

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
