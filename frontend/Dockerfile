# Phase 1: React-Frontend mit Node.js bauen
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Phase 2: Fertiges Frontend mit Nginx ausliefern
FROM nginx:1.28-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80 443
