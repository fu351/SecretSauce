FROM node:20-slim

WORKDIR /app

# Use the smaller scripts package for runtime deps needed by the queue worker.
COPY scripts/package.json scripts/package-lock.json ./scripts/
RUN npm --prefix ./scripts ci

COPY tsconfig.json ./tsconfig.json
COPY queue ./queue
COPY lib/database ./lib/database
COPY standardizer ./standardizer
COPY lib/utils ./lib/utils
COPY scripts/utils ./scripts/utils

CMD ["npm", "--prefix", "scripts", "run", "queue-worker"]
