FROM node:22-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile --prod

COPY . .

EXPOSE 3000

CMD ["node", "--import", "tsx/esm", "index.ts"]
