FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --production

COPY src/ ./src/

ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "src/index.js"]
