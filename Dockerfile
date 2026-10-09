# ROADLIVE production image.
#
# Stage 1 builds the client bundle and compiles the TypeScript server.
# Stage 2 carries only production dependencies plus the build output, so vite and
# the rest of the build toolchain never ship to production.
#
# The server is the only process: it serves the built SPA from dist/ and exposes
# the API and the chat WebSocket on the same port.

FROM node:22-alpine AS build

WORKDIR /app

# Install with the lockfile first so that dependency layers stay cached.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Client bundle -> dist/
RUN npm run build

# Server bundle -> server-dist/server.js (node_modules stay external)
RUN npm run build:server


FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8000

# Production dependencies only: express, ws, dotenv, web-push, supabase-js, ioredis.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
  && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/server-dist ./server-dist

# Drop privileges: the server never writes to disk.
USER node

EXPOSE 8000

# Koyeb, Render and most other hosts respect this; the platform health check
# path is /health as well.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server-dist/server.js"]
