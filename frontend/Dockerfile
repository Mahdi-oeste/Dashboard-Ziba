# syntax=docker/dockerfile:1.6

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_ZIBA_API_URL=/api
ARG VITE_API_BASE=/api
ARG VITE_AUTHORITY
ARG VITE_CLIENT_ID
ARG VITE_AUTH_DISABLED
ENV VITE_ZIBA_API_URL=${VITE_ZIBA_API_URL} \
    VITE_API_BASE=${VITE_API_BASE} \
    VITE_AUTHORITY=${VITE_AUTHORITY} \
    VITE_CLIENT_ID=${VITE_CLIENT_ID} \
    VITE_AUTH_DISABLED=${VITE_AUTH_DISABLED}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
CMD ["nginx", "-g", "daemon off;"]
