# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /build

# Install dependencies first so Docker layer cache is reused unless package.json changes
COPY apps/frontend/package.json apps/frontend/package-lock.json* ./
RUN npm install --prefer-offline --no-fund --no-audit

# Copy the rest of the frontend source
COPY apps/frontend/ .

RUN npm run build

# ── Runtime stage ───────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine
COPY --from=build /build/dist /usr/share/nginx/html
