import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import agents from "agents/vite";
import path from "path";

// Vercel ビルド時（Vercel は VERCEL=1 を立てる）は SPA だけを出力したいので、
// Worker/DO を扱う cloudflare()/agents() プラグインを外す。
// Vercel を外すと素の Vite ビルドになり index.html + assets が dist/ 直下に出る
// （Vercel の Vite プリセット既定 outputDir と一致）。
// 未設定（ローカル統合 dev / Worker デプロイ）では従来どおり両プラグインを有効化。
const isVercelBuild = process.env.VERCEL === "1";

export default defineConfig({
    server: {
    host: true,
    // Vite 既定の CORS ミドルウェアが /api/* の preflight を Hono の
    // corsMiddleware（src/server/cors.ts）より先に横取りしてしまい、
    // credentials 付き CORS 設定が反映されない問題があったため無効化。
    // CORS は Hono 側（corsMiddleware）に一本化する。
    cors: false,
  },
  plugins: [
    react(),
    ...(isVercelBuild ? [] : [cloudflare(), agents()]),
  ],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
  },
  resolve: {
    alias: {
      "@client": path.resolve(__dirname, "./src/client"),
      "@server": path.resolve(__dirname, "./src/server"),
      "@shared": path.resolve(__dirname, "./src/shared"),
    },
  },
});
