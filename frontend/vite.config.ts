import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
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
});
