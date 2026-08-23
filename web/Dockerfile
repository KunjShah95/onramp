# ── Build stage ──────────────────────────────────────────────────────────
FROM node:22-alpine AS build

ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=${VITE_API_URL}

WORKDIR /app

# Build context is the project root, sources are in web/
COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./
RUN npm run build

# ── Production stage — non-root nginx ────────────────────────────────────
FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
# Site config (proxies /api -> backend, SPA fallback, security headers).
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Main config with writable pid/error paths so the master can run non-root.
COPY web/nginx-main.conf /etc/nginx/nginx.conf

# nginx master runs as root only to bind port 80 — running as a non-root
# user requires a high port. Expose 8080 and let the proxy map host:80 ->
# container:8080 (keeps the public URL unchanged).
EXPOSE 8080

# Drop privileges: the master process also runs as `nginx` (uid 101) and
# binds 8080, which is allowed for unprivileged users.
USER nginx

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:8080/healthz >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
