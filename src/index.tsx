import { createRoot } from "react-dom/client";
import { App } from "./pages/App";
import "react-pdf-highlighter/dist/style.css";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthProvider } from "./contexts/AuthContext";
import { PdfProvider } from "./contexts/PdfContext";

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
if (!googleClientId) {
  throw new Error("Missing VITE_GOOGLE_CLIENT_ID in .env file");
}

const container = document.getElementById("root")!;
const root = createRoot(container);

root.render(
  <GoogleOAuthProvider clientId={googleClientId}>
    <AuthProvider>
      <PdfProvider>
        <App />
      </PdfProvider>
    </AuthProvider>
  </GoogleOAuthProvider>,
);
