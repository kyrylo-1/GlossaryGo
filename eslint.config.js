const { defineConfig } = require("eslint/config");
const raycastConfig = require("@raycast/eslint-config");
const glossaryGoConfig = require("./eslint/glossarygo-config");

module.exports = defineConfig([...raycastConfig, ...glossaryGoConfig]);
