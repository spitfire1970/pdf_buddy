import { useRef, useState, useEffect } from "react";
import type { ChangeEvent, DragEvent } from "react";
import axios from "axios";
import { useAuth } from "../contexts/AuthContext";
import { usePdf } from "../contexts/PdfContext";
import { UpgradeModal } from "../components/UpgradeModal"; // Import the new modal

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export function Home() {
  const { user, logout, token, refreshUser } = useAuth();
  const { pdfs, setPdfs, selectPdf } = usePdf();
  const [isDragging, setIsDragging] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false); // State for the modal
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const hasSessionId = query.has("session_id");
    const cameFromPortal = query.has("from_portal");

    if (hasSessionId || cameFromPortal) {
      refreshUser();
      // Clean up the URL
      window.history.pushState({}, document.title, window.location.pathname);
    }
  }, [refreshUser]);

  useEffect(() => {
    const fetchPdfs = async () => {
      if (!token) return;
      try {
        const res = await axios.get(`${API_URL}/get-pdfs/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setPdfs(res.data);
      } catch (err) {
        console.error("Failed to fetch PDFs:", err);
        setPdfs([]);
      }
    };
    fetchPdfs();
  }, [token, setPdfs]);

  const handlePdfUploadToServer = async (pdfFile: File) => {
    if (!token) {
      console.error("No auth token found.");
      return;
    }
    const formData = new FormData();
    formData.append("file", pdfFile);

    try {
      const res = await axios.post(`${API_URL}/upload-pdf/`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: `Bearer ${token}`,
        },
      });
      // Refresh the PDF list after successful upload
      setPdfs([...pdfs, res.data]);
      selectPdf(res.data.id);
    } catch (err) {
      // --- CATCH 402 PAYMENT REQUIRED ERROR ---
      if (axios.isAxiosError(err) && err.response?.status === 402) {
        console.log("Upgrade required. Opening modal.");
        setShowUpgradeModal(true);
      } else {
        console.error("Upload failed:", err);
      }
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === "application/pdf") {
      handlePdfUploadToServer(file);
    }
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file && file.type === "application/pdf") {
      handlePdfUploadToServer(file);
    }
  };

  // --- HANDLER FOR MANAGING SUBSCRIPTION ---
  const handleManageSubscription = async () => {
    if (!token) return;
    try {
      const { data } = await axios.post(
        `${API_URL}/create-portal-session`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      // Redirect to Stripe's customer portal
      window.location.href = data.url;
    } catch (error) {
      console.error("Failed to create portal session:", error);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gray-900 text-white">
      {user && (
        <header className="flex justify-between items-center p-4 border-b border-gray-700">
          <h1 className="text-2xl font-bold">
            <span className="text-blue-400">PDF</span> Buddy
          </h1>
          <h1 className="text-2xl font-normal">Dashboard</h1>
          <div className="flex items-center">
            <img
              src={user.picture}
              alt={user.name}
              referrerPolicy="no-referrer"
              className="w-10 h-10 rounded-full mr-4 border-2 border-gray-600"
            />
            {/* --- UPDATED: User Info and Subscription Status --- */}
            <div className="text-sm text-right mr-4">
              <span className="text-white font-medium block">{user.name}</span>
              <span className="text-xs text-yellow-400 font-bold uppercase tracking-wider">
                {user.subscription_tier} Plan
              </span>
            </div>
            {/* --- NEW: Manage Plan Button --- */}
            <button
              onClick={handleManageSubscription}
              className="text-sm bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-md mr-4 transition-colors"
            >
              Manage Plan
            </button>
            <button
              onClick={logout}
              className="text-sm text-gray-400 hover:text-white"
            >
              Logout
            </button>
          </div>
        </header>
      )}

      <main className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <label
            htmlFor="pdf-upload"
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            className={`cursor-pointer group transition-all duration-300 flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg ${
              isDragging
                ? "border-blue-500 bg-blue-500/10"
                : "border-gray-600 hover:border-blue-500 hover:bg-blue-500/5"
            }`}
          >
            {/* ... SVG Icon ... */}
            <span className="text-white text-lg font-semibold">
              {isDragging ? "Drop your PDF here" : "Open a new PDF"}
            </span>
            <span className="text-sm text-gray-400 mt-1">
              Click or drag a .pdf file
            </span>
          </label>

          <input
            id="pdf-upload"
            type="file"
            accept=".pdf"
            ref={inputRef}
            onChange={handleFileChange}
            className="hidden"
          />

          {pdfs.map((pdf) => (
            <div
              key={pdf.id}
              onClick={() => selectPdf(pdf.id)}
              className="bg-gray-800 p-4 rounded-lg cursor-pointer hover:bg-gray-700 transition"
            >
              <h3 className="font-semibold truncate">{pdf.filename}</h3>
              <p className="text-sm text-gray-400">
                {new Date(pdf.upload_date).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      </main>

      {/* --- RENDER THE UPGRADE MODAL CONDITIONALLY --- */}
      {showUpgradeModal && (
        <UpgradeModal
          onClose={() => setShowUpgradeModal(false)}
          token={token}
        />
      )}
    </div>
  );
}
