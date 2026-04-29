import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import RakutenCsvExtensionApp from "./RakutenCsvExtensionApp";
import 'bootstrap/dist/css/bootstrap.min.css';
import '../styles/tailwind.css';

console.log("楽天証券CSV拡張機能のポップアップが読み込まれました");

const root = document.getElementById("root");
if (!root) {
    throw new Error("Root element not found");
}

root.id = 'crx-popup-root';

const queryClient = new QueryClient();

createRoot(root).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <Routes>
                    <Route path="/" element={<RakutenCsvExtensionApp />} />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>
    </StrictMode>
);