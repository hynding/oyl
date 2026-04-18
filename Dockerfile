FROM --platform=linux/amd64 node:22-alpine AS base

WORKDIR /workspace

COPY . .

RUN npm install --global pnpm

RUN pnpm install --frozen-lockfile

FROM base AS next

WORKDIR /workspace

CMD ["pnpm", "next", "dev"]

FROM base AS react

WORKDIR /workspace

CMD ["pnpm", "react", "dev"]

FROM base AS strapi

WORKDIR /workspace

CMD ["pnpm", "strapi", "build"]

FROM base AS storybook

WORKDIR /workspace

CMD ["pnpm", "storybook", "storybook"]