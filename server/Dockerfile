FROM node:22-alpine

WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install production dependencies & tzdata for local timezone scheduling
RUN apk add --no-cache tzdata && (npm ci --only=production || npm install --only=production)

# Copy configuration, application source and web dashboard
COPY tsconfig.json ./
COPY src/ ./src/
COPY public/ ./public/

# Default environment variables
ENV PORT=8085
ENV DATA_DIR=/data
ENV CRAWL_CONCURRENCY=6
ENV CRON_HOUR=6
ENV TZ=Europe/Berlin

# Volume for persistent stats on NAS
VOLUME ["/data"]

EXPOSE 8085

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:8085/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
