import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "@fontsource/noto-sans/latin-400.css";
import "@fontsource/noto-sans/latin-700.css";
import "@fontsource/noto-serif-tibetan/400.css";
import "@fontsource/noto-serif-tibetan/700.css";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Application root is missing");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
