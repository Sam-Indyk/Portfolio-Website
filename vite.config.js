import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  resolve: { dedupe: ["three"] },
  optimizeDeps: { include: ["three", "three/addons/postprocessing/EffectComposer.js"] },
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
  server: { port: 5173, host: "127.0.0.1" },
});
