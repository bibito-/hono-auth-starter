import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import agents from "agents/vite";
import tailwindcss from "@tailwindcss/vite";
import path from 'path'

// Vercel ビルド時（Vercel は VERCEL=1 を立てる）は SPA だけを出力したいので、
// Worker/DO を扱う cloudflare()/agents() プラグインを外す。
// Vercel を外すと素の Vite ビルドになり index.html + assets が dist/ 直下に出る
// （Vercel の Vite プリセット既定 outputDir と一致）。
// 未設定（ローカル統合 dev / Worker デプロイ）では従来どおり両プラグインを有効化。
const isVercelBuild = process.env.VERCEL === "1";

export default defineConfig({
  server: {
    host: true
  },
  plugins: [
    tailwindcss(),
    react(),
    ...(isVercelBuild ? [] : [cloudflare(), agents()]),
  ],
  resolve: {
    alias: {
      "@client": path.resolve(__dirname, "./src/client"),
      "@server": path.resolve(__dirname, "./src/server"),
      "@shared": path.resolve(__dirname, "./src/shared"),
    },
  },
  build: {
    rollupOptions: {
      // vendor 分割は本番 SPA を配信する Vercel ビルドのみに適用する。
      // Worker ビルド（API 専用・wrangler deploy）は従来どおり単一バンドルのまま触らない。
      output: isVercelBuild
        ? {
            // Vite 8（Rolldown）の vendor 分割。manualChunks/advancedChunks は deprecated で、
            // 現行は codeSplitting を使う（advancedChunks と codeSplitting を併記すると前者は無視される）。
            // 安定した重量級依存をチャンク分離し、単一バンドルの 500kB 超を解消＋キャッシュ効率を上げる。
            // 公式: https://rolldown.rs/in-depth/manual-code-splitting
            codeSplitting: {
              groups: [
                { name: "react-vendor", test: /[\\/]node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/ },
                { name: "supabase", test: /[\\/]node_modules[\\/]@supabase[\\/]/ },
                { name: "query", test: /[\\/]node_modules[\\/]@tanstack[\\/]/ },
                { name: "dnd", test: /[\\/]node_modules[\\/]@dnd-kit[\\/]/ },
                { name: "form-vendor", test: /[\\/]node_modules[\\/](react-hook-form|@hookform|zod|react-day-picker)[\\/]/ },
                { name: "vendor", test: /[\\/]node_modules[\\/]/ },
              ],
            },
          }
        : {},
    },
  },
});