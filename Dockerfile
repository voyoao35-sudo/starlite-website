FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production PORT=3000 STARLITE_REQUIRE_MONGO=1 STARLITE_DOWNLOAD_MODE=external
EXPOSE 3000
CMD ["node", "server.js"]
