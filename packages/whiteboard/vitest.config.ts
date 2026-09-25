import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The board code reads `document` and `Node`, so a DOM is needed; the pure-logic tests do not mind it.
    environment: "happy-dom",
    include: ["tests/**/*.test.ts"],
  },
});
