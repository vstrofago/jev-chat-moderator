# Runs the playground locally. nginx serves the static site and forwards /typesafe-api to
# api.typesafe.ai, so TypeSafe keys work from the browser (their API sends no CORS headers).
# Build from the repository root: docker compose up --build
FROM node:24-alpine AS build
WORKDIR /app
RUN npm install -g pnpm@12.4.2
COPY . .
RUN pnpm install --frozen-lockfile
ENV PUBLIC_TYPESAFE_LOCAL_PROXY=true
RUN pnpm --filter @vigia/demo build

FROM nginx:1.29-alpine
COPY apps/demo/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/demo/dist /usr/share/nginx/html
EXPOSE 8080
