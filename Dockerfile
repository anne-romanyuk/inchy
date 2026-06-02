FROM node:20-bookworm

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN mkdir -p /app/server/data

ENV NODE_ENV=production
ENV PORT=3011
ENV PLANNER_DB=/app/server/data/planner.db

EXPOSE 3011

CMD ["npm", "start"]
