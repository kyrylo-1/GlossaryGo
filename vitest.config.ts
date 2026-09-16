const { resolve } = require("node:path") as typeof import("node:path");
const { defineConfig } = require("vitest/config") as typeof import("vitest/config");

module.exports = defineConfig({
  resolve: {
    alias: {
      "@raycast/api": resolve(__dirname, "src/test/raycast-api-stub.ts"),
    },
  },
});
