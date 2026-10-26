FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY app.js index.html styles.css ./
COPY server ./server
USER node
EXPOSE 3000
CMD ["node", "server/index.js"]
