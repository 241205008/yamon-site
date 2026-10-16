# API サーバー（Cloud Run 用、D14・D16）。リポジトリのルートをビルドの起点にする：
#   docker build -f apps/api/Dockerfile -t yamon-api .
#
# 1段目で依存を入れて1ファイルにまとめ（build.mjs）、2段目には実行に要るものだけを置く

FROM node:22-bookworm-slim AS build
WORKDIR /repo
# workspace の解決に各 package.json が要る。依存のインストールは @yamon/api の分だけにする
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspace @yamon/api --include-workspace-root=false --no-audit --no-fund
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @yamon/api

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/drizzle ./drizzle
USER node
# Cloud Run が PORT を渡す（既定 8080）。DATABASE_URL は Secret から渡す（#14）
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/index.js"]
