import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import DonerApp from "./DonerApp.jsx";
import "../theme/tokens.css";
import "../index.css";

// DONER DEFTERI GIRISI. isletme/doner/vite.config.js, ortak index.html'deki
// kafe girisini (/src/main.jsx) bu dosyayla degistirir: kafe uygulamasi
// (App.jsx ve sayfalari) doner paketine hic girmez. Web push yok; service
// worker kaydi yapilmaz.
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <DonerApp />
    </BrowserRouter>
  </React.StrictMode>
);
