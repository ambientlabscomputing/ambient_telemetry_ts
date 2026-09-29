import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/web.ts", "src/react-native.ts", "src/node.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  external: ["@sentry/browser", "@sentry/node", "@sentry/react-native", "react-native"],
});
