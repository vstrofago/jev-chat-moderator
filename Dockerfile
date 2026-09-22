# Runs the playground locally. nginx serves the static site and forwards /typesafe-api to
# api.typesafe.ai, so TypeSafe keys work from the browser (their API sends no CORS headers).
FROM node:24-alpine AS build
WORKDIR /app
RUN npm install -g pnpm@12.4.2
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ENV PUBLIC_TYPESAFE_LOCAL_PROXY=true
RUN pnpm build

FROM nginx:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
