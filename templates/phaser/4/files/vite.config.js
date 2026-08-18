import { defineConfig } from "vite";

// server.host=true binds 0.0.0.0 so the dev server is reachable from a
// Windows browser while the project lives in WSL2 (WSL2 forwards localhost
// to the Linux side). Port 8080 matches the official Phaser Vite template.
export default defineConfig({
  server: {
    host: true,
    port: 8080,
  },
});
