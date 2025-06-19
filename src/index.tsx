import { createRoot } from "react-dom/client";
import { App } from "./pages/App";
import "react-pdf-highlighter/dist/style.css";
import { GoogleOAuthProvider } from "@react-oauth/google";

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

const container = document.getElementById("root")!;
const root = createRoot(container);
root.render(
  <GoogleOAuthProvider clientId={googleClientId}>
    <App />
  </GoogleOAuthProvider>,
);
