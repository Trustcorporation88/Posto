import { defineConfig } from "vitest/config";

// Keeping a config in the project root stops Vite from searching parent folders,
// where an unrelated vite.config.ts would otherwise be loaded.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
