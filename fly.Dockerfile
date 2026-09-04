ARG caddy_version=2.11@sha256:df7f1c2fb114453b951de51a98efc010db1655a92c2e86be6706714e2417a78d
ARG caddy_builder_version=2.11-builder@sha256:b8f9c720f13f64c13dd42db28e8f38a3fab54c11fce4d93bda26d710c448dcfd

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
