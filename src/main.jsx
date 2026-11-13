// Giris sonucu obur ikiz adrese tasiniyorsa uygulama cizilmez (lib/girisDonus.js).
import { girisTasiniyor } from "./lib/girisDonus.js";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./theme/tokens.css";
import "./index.css";

// Web push icin service worker (bildirimler kilitli telefonda da calisir)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

// Sayfa obur adrese gidiyorsa uygulama cizilmez (bos ekran bir an gorunur);
// Supabase istemcisi de adresteki giris sonucunu okumaz (lib/supabase.js).
if (!girisTasiniyor) {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );
}
