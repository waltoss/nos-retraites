import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    name: "nos-retraites",
    compatibilityDate: "2025-09-02",
    compatibilityFlags: ["nodejs_compat"],
    entrypoint: "@tanstack/react-start/server-entry",
    domains: ["nos-retraites.app"],
  },
});
