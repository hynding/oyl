FROM --platform=linux/amd64 node:22-alpine AS base

WORKDIR /workspace

COPY . .

RUN npm install --global pnpm

RUN pnpm install --frozen-lockfile

FROM base AS next

WORKDIR /workspace

CMD ["pnpm", "next", "dev"]

FROM base AS strapi

WORKDIR /workspace

CMD ["pnpm", "strapi", "build"]