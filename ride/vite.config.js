import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Standalone "ride" app. Shares the same Supabase project (and therefore the
// same membership pool) as the order app via the same VITE_SUPABASE_* env vars.
// Deploy ride/dist to ride.notinparis.me as its own Vercel project.
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  server: { port: 3001 },
  build: { outDir: "dist", emptyOutDir: true },
});
