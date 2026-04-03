FROM mcr.microsoft.com/playwright:v1.54.0-jammy

WORKDIR /app

COPY package.json package.json
RUN npm install --omit=dev

COPY src ./src
COPY .env.example ./.env.example

RUN mkdir -p /app/data/artifacts

CMD ["npm", "start"]
