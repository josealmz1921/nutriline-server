# Imagen de desarrollo: incluye CLI de Prisma para ejecutar migraciones.
FROM node:24.22.2-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN DATABASE_URL=mysql://build:build@localhost:3306/build npm run db:generate \
    && npm run build

# Vitest necesita crear archivos temporales junto a su configuración.
RUN chown node:node /app

USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]
