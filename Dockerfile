FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --no-audit --no-fund
COPY frontend/ frontend/
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3001 DATABASE_PATH=/data/na-distributors.sqlite
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node backend/package.json backend/package.json
COPY --chown=node:node frontend/package.json frontend/package.json
RUN npm ci --omit=dev --workspace=@na-distributors/backend --ignore-scripts --no-audit --no-fund \
    && npm cache clean --force \
    && mkdir /data && chown node:node /data
COPY --chown=node:node backend/src/ backend/src/
COPY --from=build --chown=node:node /app/frontend/dist/ frontend/dist/
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "backend/src/server.js"]
