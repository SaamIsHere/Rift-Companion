FROM node:22-alpine

WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production || npm install --only=production

# Copy application source and web dashboard
COPY src/ ./src/
COPY public/ ./public/

# Default environment variables
ENV PORT=8080
ENV DATA_DIR=/data
ENV CRAWL_CONCURRENCY=6
ENV CRON_HOUR=4

# Volume for persistent stats on NAS
VOLUME ["/data"]

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["node", "src/index.mjs"]
