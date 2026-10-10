import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests live next to the modules they cover (src/**/*.test.ts) — easier
    // to spot than a separate tests/ tree, and means the test is deleted
    // together with the module if it ever goes away.
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Each test gets a fresh dynamic import — no shared module state.
    isolate: true,
  },
});
