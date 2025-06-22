import react from "@vitejs/plugin-react";
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
  },
  plugins: [react(), tailwindcss()],
  server: {
    port: 3003,
    allowedHosts: ['pdf.nakul.one'] as any,
  } as any,
  define: {
    APP_VERSION: JSON.stringify(process.env.npm_package_version),
  },
});