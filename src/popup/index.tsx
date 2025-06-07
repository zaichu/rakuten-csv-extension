import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

console.log("Popup script loaded");

const root = document.getElementById("root");
if (!root) {
    throw new Error("Root element not found");
}

root.id = 'crx-popup-root';
document.body.appendChild(root);

createRoot(root).render(
    <StrictMode>
        <h1>Welcome to the Popup!</h1>
    </StrictMode>
);