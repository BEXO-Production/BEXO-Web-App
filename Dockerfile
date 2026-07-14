FROM node:24-slim

WORKDIR /app

# Install pnpm (lock to local version 10.33.2)
RUN npm install -g pnpm@10.33.2

# Copy lockfile and configs
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json tsconfig.base.json .npmrc ./

# Copy all packages/apps
COPY artifacts ./artifacts
COPY lib ./lib
COPY scripts ./scripts

# Install dependencies and build
RUN pnpm install --frozen-lockfile
RUN pnpm exec tsc --build --clean
# PORT and BASE_PATH are required by vite.config.ts at build time (dev-server config only)
RUN PORT=5173 BASE_PATH=/ pnpm build

# Clean dev dependencies step removed to prevent pruning runtime peer-dependencies in monorepo
ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "artifacts/api-server/dist/index.mjs"]
