FROM node:20-alpine AS builder

RUN apk add --no-cache git && \
    npm install -g pnpm@8

WORKDIR /app

COPY pnpm-lock.yaml* package.json pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm -r build

FROM node:20-alpine

ENV NODE_ENV=production
ENV PATH=/app/node_modules/.bin:$PATH
ENV NODE_PATH=/app/node_modules:/app/packages

WORKDIR /app

COPY --from=builder \
    /app/node_modules ./node_modules

COPY --from=builder \
    /app/packages/*/dist ./packages/

COPY --from=builder \
    /app/bin/cli.js ./bin/

COPY --from=builder \
    /app/data ./data
COPY --from=builder \
    /app/locales ./locales

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD wget -qO- http://localhost:8102/health | grep -q '"status":"OK"'

EXPOSE 8102
CMD ["node", "bin/cli.js", "server", "--port", "8102"]