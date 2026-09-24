# Vigía server mode for a VPS. Build from the repository root:
#   docker compose -f apps/server/docker-compose.yml up -d --build
FROM node:24-alpine
WORKDIR /app
RUN npm install -g pnpm@12.4.2
COPY . .
# Only the server and the UI (with their dependencies): the desktop app would pull in Electron.
RUN pnpm install --frozen-lockfile --filter "@vigia/server-app..." --filter "@vigia/ui..." && pnpm --filter @vigia/ui build
ENV VIGIA_UI_DIR=/app/packages/ui/dist \
    NODE_ENV=production
WORKDIR /app/apps/server
# Rules (vigia.yaml), history and the Twitch login live here. A new named volume copies this
# folder's owner, so the unprivileged user below can write to it.
RUN mkdir /data && chown node:node /data
VOLUME /data
EXPOSE 7777
USER node
ENTRYPOINT ["npx", "tsx", "src/cli.ts", "--config", "/data/vigia.yaml", "--data", "/data", "--host", "0.0.0.0"]
CMD ["--source", "twitch"]
