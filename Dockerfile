FROM docker.m.daocloud.io/library/node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM docker.m.daocloud.io/library/node:20-alpine AS runner

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY server.js ./server.js
COPY public ./public
COPY runtime ./runtime

EXPOSE 80

CMD ["npm", "run", "start"]