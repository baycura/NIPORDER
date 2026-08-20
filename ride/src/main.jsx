import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { RideAuthProvider } from "./auth/RideAuthContext.jsx";
import RideApp from "./RideApp.jsx";
import "./theme/ride.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <RideAuthProvider>
        <RideApp />
      </RideAuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
