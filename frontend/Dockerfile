FROM node:22-alpine

WORKDIR /app

# Install dependencies first for better layer caching.
# Application source is bind-mounted at runtime; node_modules is an anonymous volume.
COPY package.json package-lock.json ./
RUN npm ci

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
