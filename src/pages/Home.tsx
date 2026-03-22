import { useRef, useState, useEffect } from "react";
import type { ChangeEvent, DragEvent } from "react";
import axios from "axios";
import { useAuth } from "../contexts/AuthContext";
import { usePdf } from "../contexts/PdfContext";
import { UpgradeModal } from "../components/UpgradeModal";

import { API_URL } from "../config";

export function Home() {
  const { user, logout, token, refreshUser } = useAuth();
  const { pdfs, setPdfs, selectPdf } = usePdf();
  const [isDragging, setIsDragging] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pdfToDelete, setPdfToDelete] = useState<string | null>(null);

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

  const handleDeleteClick = (e: React.MouseEvent, pdfId: string) => {
    e.stopPropagation(); // Prevent navigating to the PDF view
    setPdfToDelete(pdfId);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!pdfToDelete || !token) return;
    try {
      await axios.delete(`${API_URL}/pdfs/${pdfToDelete}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPdfs(pdfs.filter((p) => p.id !== pdfToDelete));
    } catch (err) {
      console.error("Failed to delete PDF:", err);
      alert("An error occurred while deleting the PDF.");
    } finally {
      setShowDeleteConfirm(false);
      setPdfToDelete(null);
    }
  };

  return (
    <div className="min-h-screen w-full bg-accent-950 text-white">
      {user && (
        <header className="flex flex-col md:flex-row md:justify-between items-center p-4 gap-4 border-b border-accent-700">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl md:text-3xl font-bold">
              <span className="text-accent-300">PDF</span>{" "}
              <span className="text-accent-50"> Buddy </span>
            </h1>
          </div>
          <h1 className="text-2xl md:text-3xl font-normal hidden sm:block">
            Dashboard
          </h1>

          <div className="flex flex-col md:flex-row items-center justify-center gap-3">
            <div className="flex items-center gap-3">
              <img
                src={user.picture}
                alt={user.name}
                referrerPolicy="no-referrer"
                className="w-12 h-12 rounded-full border-2 border-gray-600"
              />
              <div className="text-sm text-center md:text-right">
                <span className="text-white font-medium block">
                  {user.name}
                </span>
                <span className="text-xs text-accent-300 font-bold uppercase tracking-wider">
                  {user.subscription_tier} Plan
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 w-full md:w-auto">
              <button
                onClick={handleManageSubscription}
                className="text-sm bg-accent-700 hover:bg-accent-600 text-white font-semibold py-2 px-4 rounded-md transition-colors w-full md:w-auto"
              >
                Manage Plan
              </button>
              <button
                onClick={logout}
                className="text-sm text-accent-100 hover:text-white"
              >
                Logout
              </button>
            </div>
          </div>
        </header>
      )}

      <main className="p-4 md:p-8">
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
                ? "border-accent-500 bg-accent-500/10"
                : "border-accent-600 hover:border-accent-500 hover:bg-accent-500/5"
            }`}
          >
            <svg
              aria-hidden="true"
              className={`w-16 h-16 mb-4 transition-colors animate-pulse ${
                isDragging
                  ? "text-accent-500"
                  : "text-accent-400 group-hover:text-accent-500"
              }`}
              fill="none"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M7 10V9C7 6.23858 9.23858 4 12 4C14.7614 4 17 6.23858 17 9V10C19.2091 10 21 11.7909 21 14C21 15.4806 20.1956 16.8084 19 17.5M7 10C4.79086 10 3 11.7909 3 14C3 15.4806 3.8044 16.8084 5 17.5M7 10C7.43285 10 7.84965 10.0688 8.24006 10.1959M12 12V21M12 12L15 15M12 12L9 15"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-white text-lg font-semibold text-center">
              {isDragging ? "Drop your PDF here" : "Open a new PDF"}
            </span>
            <span className="text-sm text-gray-400 mt-0 text-center">
              Click or drag a .pdf file
            </span>
            {user?.subscription_tier == "free" && (
              <span className="text-sm text-accent-50 mt-2">
                ({pdfs.length}/3 free uploads used)
              </span>
            )}
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
              className="bg-accent-800 p-4 rounded-lg cursor-pointer hover:bg-accent-700 transition relative group"
            >
              <button
                onClick={(e) => handleDeleteClick(e, pdf.id)}
                className="absolute top-2 right-2 p-1 bg-red-600/50 rounded-full text-white opacity-0 group-hover:opacity-100 hover:bg-red-600 focus:opacity-100 transition-opacity z-10"
                aria-label="Delete PDF"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
              <h3 className="font-semibold truncate pr-6">{pdf.filename}</h3>
              <p className="text-sm text-gray-400">
                {new Date(pdf.upload_date).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      </main>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-accent-800 rounded-lg p-6 md:p-8 shadow-xl max-w-sm w-full mx-4">
            <h2 className="text-xl font-bold text-accent-50 mb-4">
              Confirm Deletion
            </h2>
            <p className="text-accent-200 mb-6">
              Deleting the document would delete any associated chats, do you
              want to continue?
            </p>
            <div className="flex justify-end gap-4">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="py-2 px-4 rounded-md bg-accent-500 hover:bg-accent-400 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="py-2 px-4 rounded-md bg-main-600 hover:bg-main-500 text-white font-semibold transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {showUpgradeModal && (
        <UpgradeModal
          onClose={() => setShowUpgradeModal(false)}
          token={token}
        />
      )}
    </div>
  );
}
