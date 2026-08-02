FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

ARG NEXT_PUBLIC_HERMES_MODE=live
ARG NEXT_PUBLIC_BASE_PATH=
ENV NEXT_PUBLIC_HERMES_MODE=$NEXT_PUBLIC_HERMES_MODE
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
RUN npm run build

FROM caddy:2-alpine

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/out /srv
EXPOSE 8080
