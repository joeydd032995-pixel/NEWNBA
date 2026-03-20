# Development stage
# Pinned to node:20.19.0-alpine3.21 to prevent floating-tag digest rotation,
# which causes BuildKit parent snapshot errors when the host cache references
# a digest that has since been replaced by a newer pull.
FROM node:20.19.0-alpine3.21 AS development
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]

# Build stage
FROM node:20.19.0-alpine3.21 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM nginx:1.27-alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
