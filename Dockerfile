# syntax=docker/dockerfile:1.7
#
# Two-stage Dockerfile for AstroPaper+.
#
# Stage 1: build the static site.
# Stage 2: serve `dist/` from nginx with the same security-header
# posture that `_headers` gives Cloudflare/Netlify deploys.
#
# The build stage pins the digest-locked `node:24` base via
# `NODE_VERSION`/`NODE_DIGEST` and matches the
# `packageManager` field in `package.json` — both halves of the
# toolchain are explicit so the build is reproducible across CI
# runs, contributor machines, and future Node/pnpm majors.
ARG NODE_VERSION=24.18.0
# Image manifest digest for `node:${NODE_VERSION}-bookworm-slim`.
# Pin both the tag AND the digest: docker resolves the digest and
# verifies it matches the tag — if upstream ever re-tags without
# rebuilding (or ships a poisoned update), the build fails loud.
# Refresh this with:
#   $ docker buildx imagetools inspect node:${NODE_VERSION}-bookworm-slim
# Look for the `application/vnd.oci.image.index.v1+json` entry —
# that's the multi-arch manifest digest, what `FROM …@digest` needs.
ARG NODE_DIGEST=sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d
ARG NGINX_VERSION=1.30.4
# Image manifest digest for `nginx:${NGINX_VERSION}-alpine`. Refresh
# the same way as NODE_DIGEST (imagetools inspect the tag, copy the
# multi-arch manifest digest). nginx's alpine tag moves slowly —
# expect to refresh on every nginx minor bump.
ARG NGINX_DIGEST=sha256:97d490c12ba55b4946b01546d1c3ed324e8d41ab1c9fcb2a616aa470620e5b46

# ─── Stage 1: build ────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim@${NODE_DIGEST} AS base

# `corepack prepare pnpm@<ver>` needs the version BEFORE anything
# is copied into the image — the install layer below also depends
# on `pnpm` being on PATH. We pass `PNPM_VERSION` as a real build
# arg with a default matching `packageManager` in `package.json`
# (refresh via `--build-arg PNPM_VERSION=…` if they ever drift —
# the build will fail loud at `corepack prepare` instead of
# silently installing a wrong pnpm). The previous awk-from-image
# trick couldn't run here because `package.json` isn't in the
# build context until the COPY below, so the substitution
# produced an empty version and broke every `docker build`.
ARG PNPM_VERSION=10.18.1
# `OG_RENDER_VERSION` is mixed into the per-post OG image cache
# busting hash. When unset, the build falls back to a content hash
# of the OG render inputs (see `src/utils/ogConstants.ts`); CI
# runners that already have the upstream commit SHA available
# (typical Cloudflare / GitHub Actions builds) should pass it via
# `--build-arg OG_RENDER_VERSION=$(git rev-parse --short HEAD)`
# so the token ties to the commit, not to the source bytes (which
# are identical between successive deploys of the same SHA).
ARG OG_RENDER_VERSION
RUN corepack enable \
    && corepack prepare pnpm@${PNPM_VERSION} --activate

WORKDIR /app

# Copy lockfile + manifest first so this layer caches when only
# source files change.
COPY package.json pnpm-lock.yaml ./
#
# `--ignore-scripts` skips the npm lifecycle scripts declared in
# `package.json` (`prepare`/`postinstall`) which call into
# `scripts/install-hooks.mjs` and `astro sync`. Neither can run in
# this layer — the script source, `.githooks/`, `astro.config.ts`,
# and `src/` aren't in the image yet. `astro sync` re-runs at the
# start of `astro build` later in the stage, and `install-hooks`
# is a contributor-machine convenience, not a build prerequisite.
RUN pnpm install --frozen-lockfile --ignore-scripts

# Now copy the rest and build the site. The build script runs
# `astro check && astro build && pagefind --site dist` — fails the
# stage on any TypeScript / content error.
#
# #16 OPS — `COPY . .` already brings in `_headers`,
# `astro-paper.config.ts`, and `astro.config.ts`, but the explicit
# `COPY` lines below pin the file set so a future `.dockerignore`
# cleanup that accidentally excludes one of these root files
# (e.g. an editor treating `_headers` as "build output") fails the
# build with a clear error instead of producing a silently-broken
# container. The smoke test `src/__tests__/dockerContext.test.ts`
# pins the no-drift invariant.
COPY _headers ./
COPY astro-paper.config.ts ./
COPY astro.config.ts ./
COPY . .
# Deterministic sitemap <lastmod> for non-post pages: a caller-provided
# SOURCE_DATE_EPOCH (Unix seconds) is read by src/integrations/sitemap.ts
# (resolvePageLastmod, line 81). The alpine builder has no git, so without
# this the build falls to Date.now() and lastmod drifts every rebuild.
# Unset -> empty -> same fallback as today (backward compatible).
ARG SOURCE_DATE_EPOCH
ENV SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH}
RUN pnpm exec astro sync && pnpm run build

# ─── Stage 2: runtime ─────────────────────────────────────────────
FROM nginx:${NGINX_VERSION}-alpine@${NGINX_DIGEST} AS runtime

# Hardening: workers run as the unprivileged `nginx` user (uid 101).
# The master must stay root — nothing else can `bind()` to port 80.
#
# The `user` directive is `main`-context only per nginx docs; it must
# live in `/etc/nginx/nginx.conf`, NOT in a conf.d include (which
# lands inside the http { } block). The actual switch is a sed
# against the upstream nginx.conf.
#
# Different upstream nginx.conf variants ship with `user` either
# commented (`#user nobody;`) or uncommented (`user nobody;`). The
# two-pass sed below handles both, then a grep verifies the
# substitution landed.
ARG NGINX_USER=nginx
RUN set -eux; \
    sed -i "s,^#user .*,user ${NGINX_USER} ${NGINX_USER};" \
        /etc/nginx/nginx.conf; \
    sed -i "s,^user .*,user ${NGINX_USER} ${NGINX_USER};" \
        /etc/nginx/nginx.conf; \
    grep -q "^user ${NGINX_USER} " /etc/nginx/nginx.conf \
        || (echo "FATAL: failed to set 'user' directive in main nginx.conf" \
            && exit 1)

# nginx config that `include`s the generated security-headers file.
# The headers themselves live in `dist/nginx-headers.conf` (written by
# astro.config.ts's `cloudflareHeadersIntegration` on every build)
# and carry the same strict CSP — same per-script sha256- allowlist,
# no `'unsafe-inline'` — as the Cloudflare/Netlify deploy gets from
# `_headers`. Without `nginx-headers.conf`, a Docker host would ship
# the weaker `'unsafe-inline'` fallback.
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=base /app/dist/nginx-headers.conf /etc/nginx/nginx-headers.conf

# Static site output from the build stage.
COPY --from=base /app/dist /usr/share/nginx/html

# nginx workers need write access to its cache dir and pid file;
# everything else (config, docroot) stays root-owned / world-readable.
# The previous `-R` chown'd `/etc/nginx` and `/usr/share/nginx/html`
# to the worker user too — a compromised worker could then rewrite
# the docroot (instant persistent defacement served under the very
# CSP hashes the build regenerated) or edit config the root master
# would reload on next start. Workers need *write* access to the
# cache + pid paths only; `touch` the pid file first if upstream
# didn't create it (default nginx alpine has no `/var/run/nginx.pid`
# in the image at all).
RUN chown -R ${NGINX_USER}:${NGINX_USER} /var/cache/nginx \
    && touch /var/run/nginx.pid \
    && chown ${NGINX_USER}:${NGINX_USER} /var/run/nginx.pid

# `wget --spider` is part of busybox in the nginx alpine image and is
# enough for an HTTP HEAD-style liveness probe against `/`. Three
# retries inside a 5s start period tolerates a slow first paint.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --spider http://localhost/ || exit 1

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"] 