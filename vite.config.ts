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
    allowedHosts: ['pdf.nakul.one', 'pdfbuddy.site', 'www.pdfbuddy.site'] as any,
    watch: {
      ignored: [
        '**/myenv/**', // Add this line to ignore the Python virtual environment
      ],
    },
  } as any,
  define: {
    APP_VERSION: JSON.stringify(process.env.npm_package_version),
  },
});