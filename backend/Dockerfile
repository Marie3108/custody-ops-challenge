FROM node:22-alpine

WORKDIR /app

COPY backend/package*.json ./
RUN npm ci

COPY backend/tsconfig.json ./
COPY backend/src ./src
COPY data ./data

RUN npm run build

COPY backend/src/config/schema.sql ./dist/config/schema.sql

EXPOSE 3000

CMD ["npm", "start"]