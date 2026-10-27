import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, "");
  const passwordMinLength =
    env.VITE_PASSWORD_MIN_LENGTH?.trim() || env.PASSWORD_MIN_LENGTH?.trim() || String(12);
  // On Vercel the API is served from the same origin under /api (see vercel.json).
  const apiBaseUrl = env.VITE_API_BASE_URL?.trim() || (process.env.VERCEL ? "/" : undefined);

  return {
    plugins: [tailwindcss(), react()],
    resolve: {
      alias: {
        "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "src"),
      },
    },
    envDir: repoRoot,
    define: {
      "import.meta.env.VITE_PASSWORD_MIN_LENGTH": JSON.stringify(passwordMinLength),
      ...(apiBaseUrl !== undefined
        ? { "import.meta.env.VITE_API_BASE_URL": JSON.stringify(apiBaseUrl) }
        : {}),
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: true,
    },
    test: {
      environment: "jsdom",
      include: ["src/**/*.test.{ts,tsx}", "functions/**/*.test.ts"],
      setupFiles: "./src/test/setup.ts",
      restoreMocks: true,
      unstubGlobals: true,
      unstubEnvs: true,
    },
  };
});
