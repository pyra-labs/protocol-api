// vitest.config.js
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
      plugins: [tsconfigPaths()],
      test: {
            exclude: ["**/node_modules/**", "**/build/**"],
            include: ["src/**/*.test.ts"],
            poolOptions: {
                  forks: {
                        singleFork: true,
                  },
            },
            globals: true,
            globalSetup: ["./globalSetup.ts"],
            testTimeout: 300_000,
      },
});
