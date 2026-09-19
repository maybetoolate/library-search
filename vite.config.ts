import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API = "http://localhost:3000";

export default defineConfig({
  root: "client",
  plugins: [react()],
  server: {
    proxy: {
      "/books": API,
      "/stats": API,
      "/config": API,
      "/health": API,
    },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
