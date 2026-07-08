import { defineConfig } from 'vite';

// base './' so the built bundle can be hosted from any sub-path.
// server.host = true lets you open the dev server from a phone on the same LAN.
export default defineConfig({
  base: './',
  server: { host: true },
});
