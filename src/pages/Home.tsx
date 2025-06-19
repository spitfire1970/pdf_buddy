import { useRef, useState, useEffect } from "react";
import type { ChangeEvent, DragEvent } from "react";
import axios from "axios";
import { useAuth } from "../contexts/AuthContext";
import { usePdf } from "../contexts/PdfContext";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export function Home() {
  const { user, logout, token } = useAuth();
  const { pdfs, setPdfs, selectPdf } = usePdf();
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchPdfs = async () => {
      if (!token) return;
      try {
        const res = await axios.get(`${API_URL}/get-pdfs/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        // FIX: The backend returns a direct array, so we use res.data directly
        // instead of res.data.pdfs.
        setPdfs(res.data);
      } catch (err) {
        console.error("Failed to fetch PDFs:", err);
        // It's good practice to set it to an empty array on failure
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
      // The upload endpoint now returns the new PDF's ID, which we use to select it.
      selectPdf(res.data.id);
    } catch (err) {
      console.error("Upload failed:", err);
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

  return (
    <div className="min-h-screen w-full bg-gray-900 text-white">
      {user && (
        <header className="flex justify-between items-center p-4 border-b border-gray-700">
          <h1 className="text-2xl font-bold">
            <span className="text-accent">PDF</span> Buddy
          </h1>
          <h1 className="text-2xl font-normal">Dashboard</h1>
          <div className="flex items-center">
            <img
              src={user.picture}
              alt={user.name}
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-full mr-3"
            />
            <span className="text-white text-sm font-medium mr-4">
              {user.name}
            </span>
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
                ? "border-main bg-main/10"
                : "border-gray-600 hover:border-main hover:bg-main/5"
            }`}
          >
            <svg
              className="w-12 h-12 text-main mb-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M12 12v9"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 16l-3-3-3 3"
              />
            </svg>
            <span className="text-white text-lg font-semibold">
              Upload New PDF
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
    </div>
  );
}
