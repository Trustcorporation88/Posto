FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
# The published site calls its own origin; never bake an API host into the bundle.
RUN EXPO_PUBLIC_API_BASE_URL= pnpm build:production

# Runtime dependencies only: no Expo, Metro, test or build tooling in the final image.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/web-build ./web-build
# SQL migrations applied by `node dist/admin.mjs migrate` (Railway pre-deploy step).
COPY --from=build --chown=node:node /app/drizzle/meta ./drizzle/meta
COPY --from=build --chown=node:node /app/drizzle/*.sql ./drizzle/
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
