FROM node:22-slim

WORKDIR /app

RUN npm install -g pnpm

# Copy workspace config + lockfile + server package.json
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/package.json

# Install only server deps via pnpm workspace filter
RUN pnpm install --filter chatbridge-server --frozen-lockfile || pnpm install --filter chatbridge-server

# Copy server source
COPY server/ server/

# Build server
RUN cd server && pnpm build

EXPOSE 3001

CMD ["node", "server/dist/index.js"]
