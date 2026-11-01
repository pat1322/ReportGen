FROM node:22-bookworm-slim

# LibreOffice (PPTX -> PDF) + fonts used by the template
RUN apt-get update \
 && apt-get install -y --no-install-recommends libreoffice-impress libreoffice-core fontconfig fonts-dejavu-core ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY fonts/ /usr/local/share/fonts/report/
RUN fc-cache -f

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY . .

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
