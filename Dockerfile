FROM node:24-slim

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy lockfile and configs
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json tsconfig.base.json .npmrc ./

# Copy all packages/apps
COPY artifacts ./artifacts
COPY lib ./lib
COPY scripts ./scripts

# Install dependencies and build
RUN pnpm install --frozen-lockfile
RUN pnpm build

# Clean dev dependencies for a smaller image size
RUN pnpm prune --prod

ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "artifacts/api-server/dist/index.mjs"]
