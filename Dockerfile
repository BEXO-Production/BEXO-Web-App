FROM node:22-slim

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10.5.2

# Copy lockfile and configs
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json tsconfig.base.json ./

# Copy all packages/apps
COPY artifacts ./artifacts
COPY lib ./lib
COPY scripts ./scripts

# Install dependencies and build api-server
RUN pnpm install
RUN pnpm --filter @workspace/api-server run build

ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "artifacts/api-server/dist/index.mjs"]
