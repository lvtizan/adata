import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div className="min-h-screen bg-canvas text-text-primary p-6">
      <h1 className="text-xl font-semibold">A-Share Terminal</h1>
      <p className="text-text-secondary text-sm mt-2">Rewrite in progress...</p>
    </div>
  </StrictMode>,
);
