# Multietapa con `output: "standalone"`: al final solo viaja server.js con lo que usa.
FROM node:22-slim AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && pnpm install --frozen-lockfile

FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Se incrustan en el bundle, asi que tienen que estar en tiempo de build. Nada secreto va aqui:
# un build arg queda en la imagen.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SURFACE=dashboard
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SURFACE=$NEXT_PUBLIC_SURFACE

RUN pnpm build

FROM node:22-slim AS runtime

# curl: el healthcheck de la plataforma se inyecta desde fuera de la imagen y usa curl o wget. Sin
# el, el despliegue se marca como no saludable y se revierte aunque la aplicacion este respondiendo.
# Sin root: el analisis estatico del codigo entregado lo revisa.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 radar

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build --chown=radar:radar /app/.next/standalone ./
COPY --from=build --chown=radar:radar /app/.next/static ./.next/static

USER radar
# Coolify toma el primer EXPOSE como puerto inicial del recurso.
EXPOSE 3000
ENV HOSTNAME=0.0.0.0 PORT=3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
    CMD curl -fsS http://127.0.0.1:3000/ || exit 1

CMD ["node", "server.js"]
