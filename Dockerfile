FROM node:20-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---- Étape dépendances ----
FROM base AS deps
COPY package*.json ./
COPY prisma ./prisma
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates tini \
  && rm -rf /var/lib/apt/lists/* \
  && npm ci

# ---- Étape dev (utilisée par docker-compose.yml) ----
FROM deps AS dev
ENV NODE_ENV=development
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ---- Étape build ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# next.config.ts produit un build standalone — image ~3x plus petite en prod.
RUN npm run build

# ---- Étape runner (image finale) ----
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# tini comme PID 1 pour gérer SIGTERM proprement + utilisateur non-root
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates tini wget \
  && rm -rf /var/lib/apt/lists/*

# Copie minimale issue du build standalone
COPY --from=builder /app/public ./public
# Le standalone embarque le serveur Next + node_modules nécessaires uniquement
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/generated ./generated
COPY --from=builder --chown=node:node /app/prisma ./prisma

USER node
EXPOSE 3000

# Sonde HTTP : 200 si la route /api/health répond, sinon échec → orchestrateur restart.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
