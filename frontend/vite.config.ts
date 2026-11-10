import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Basis-URL des ASP.NET-Backends. Fallback ist der HTTPS-Port aus
// sims/Properties/launchSettings.json (Profil "https").
// Hinweis: Die API sendet kein Access-Control-Allow-Origin; ein Direktaufruf
// von http://localhost:5173 ohne diesen Proxy schlaegt im Browser fehl.
const BACKEND_ORIGIN = process.env.VITE_BACKEND_ORIGIN ?? "https://localhost:7266";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // API-Pfade laufen proxy-seitig durch denselben Origin, damit die
      // SameSite=Strict-Cookies (SIMS.Auth, SIMS.CSRF) ohne CORS greifen.
      "/api": {
        target: BACKEND_ORIGIN,
        changeOrigin: true,
        secure: false
      }
    }
  }
});
