import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import RakutenCsvExtensionApp from "./RakutenCsvExtensionApp";
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';

console.log("楽天証券CSV拡張機能のポップアップが読み込まれました");

const root = document.getElementById("root");
if (!root) {
    throw new Error("Root element not found");
}

root.id = 'crx-popup-root';

createRoot(root).render(
    <StrictMode>
        <RakutenCsvExtensionApp />
    </StrictMode>
);