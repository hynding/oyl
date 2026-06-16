# App-stack image — the new apps/ stack (apps/strapi-oyl backend + apps/vanilla-oyl).
# Host architecture (native on Apple Silicon), build
# tools for native deps, layer-cached manifest staging. Shared by the strapi-app and
# vanilla compose services, which each override `command`.

FROM node:22-alpine

WORKDIR /workspace

# wget powers the strapi healthcheck; python3/make/g++ build native deps at install.
RUN apk add --no-cache wget python3 make g++

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

# Stage every workspace member's manifest first so a code-only edit doesn't bust the
# install layer. `--frozen-lockfile` needs ALL members present (packages/* AND apps/*).
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/all-of-oyl/package.json ./packages/all-of-oyl/
COPY apps/strapi-oyl/package.json ./apps/strapi-oyl/
COPY apps/vanilla-oyl/package.json ./apps/vanilla-oyl/

RUN pnpm install --frozen-lockfile

# Source after install so source edits don't invalidate the dep layer.
COPY . .

# Default command (strapi-app); the vanilla service overrides it in compose.
CMD ["pnpm", "strapi-app", "develop"]
