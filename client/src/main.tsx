import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installApiBaseInterceptor } from "./lib/api";

// In native (Capacitor) builds VITE_API_BASE_URL is set to the deployed
// backend URL.  The interceptor rewrites all server-relative fetch() paths
// so every raw `fetch('/api/...')` call reaches the correct backend.
// This is a no-op for the web build (VITE_API_BASE_URL is empty).
installApiBaseInterceptor();

createRoot(document.getElementById("root")!).render(<App />);
