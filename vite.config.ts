import react from "@vitejs/plugin-react";
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
        },
      },
    },
  },
  plugins: [react(), tailwindcss()],
  server: {
    port: 3003,
    host: true,
    allowedHosts: ['pdf.nakul.one', 'pdfbuddy.site', 'www.pdfbuddy.site'] as any,
    watch: {
      ignored: [
        '**/myenv/**',
      ],
    },
  } as any,
  define: {
    APP_VERSION: JSON.stringify(process.env.npm_package_version),
  },
});