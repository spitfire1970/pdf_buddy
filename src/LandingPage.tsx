import { useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import axios from "axios";

interface LandingPageProps {
  onFileUpload: (file: File) => void;
}

const uploadPDF = async (pdfFile: File) => {
  const formData = new FormData();
  formData.append("file", pdfFile); // Must match FastAPI param name

  try {
    const response = await axios.post(
      "http://localhost:8000/upload-pdf/",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );
  } catch (err) {
    console.error("Upload failed:", err);
  }
};

export function LandingPage({ onFileUpload }: LandingPageProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === "application/pdf") {
      onFileUpload(file);
      uploadPDF(file);
    }
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file && file.type === "application/pdf") {
      onFileUpload(file);
      uploadPDF(file);
    }
  };

  return (
    <div className="min-h-screen w-full bg-black text-white flex items-center justify-center px-4 py-12">
      <div className="max-w-7xl w-full grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        {/* Upload Box */}
        <div className="p-8 bg-black/60 border border-gray-700 rounded-3xl backdrop-blur-xl shadow-2xl">
          <h1 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight">
            <span className="text-accent">PDF</span> Buddy
          </h1>
          <p className="text-lg text-gray-300 mb-8">
            No research paper is too complex.
            <span className="text-accent"> Talk </span>to it. Read it like you
            wrote it.
          </p>

          <label
            htmlFor="pdf-upload"
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            className={`group transition-all duration-300 flex flex-col items-center justify-center px-8 py-14 border-2 border-dashed rounded-2xl cursor-pointer
              ${isDragging ? "border-main bg-main/10" : "border-gray-600 hover:border-main hover:bg-main/5"}
            `}
          >
            <svg
              className="w-12 h-12 text-main mb-3 animate-pulse transition-transform duration-300"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path
                d="M12 16V8m0 0l3 3m-3-3L9 11"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M3 15v1a4 4 0 004 4h10a4 4 0 004-4v-1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-white text-lg font-semibold">
              {isDragging
                ? "Drop your PDF here"
                : "Click or Drag your PDF to start"}
            </span>
            <span className="text-sm text-gray-400 mt-1">
              Only .pdf files are supported
            </span>
          </label>

          {/* Start: Pitch Section */}
          <div className="mt-8 text-center">
            {/* Start: Fun Fact Box */}
            <div className="mb-6 p-3 bg-gray-800/50 border border-gray-700 rounded-xl text-sm">
              <div className="flex items-center justify-center gap-3">
                <p className="text-gray-400">
                  <span className="font-semibold text-gray-300">
                    ⁉️ Not so fun fact:
                  </span>{" "}
                  Claude and ChatGPT parse LaTeX equations incorrectly and
                  completely ignore figures in PDFs.
                </p>
              </div>
            </div>
            {/* End: Fun Fact Box */}
            <p className="text-lg font-semibold text-gray-200 mb-4">
              You deserve better than a simple text extractor.
            </p>
            <ul className="space-y-3 text-gray-400 text-sm">
              <li className="flex items-start md:items-center justify-center gap-2">
                <svg
                  className="w-4 h-4 text-accent flex-shrink-0 mt-1 md:mt-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>
                  Unlike ChatGPT, we{" "}
                  <span className="text-gray-300 font-medium">
                    correctly interpret figures and LaTeX equations.
                  </span>
                </span>
              </li>
              <li className="flex items-start md:items-center justify-center gap-2">
                <svg
                  className="w-4 h-4 text-accent flex-shrink-0 mt-1 md:mt-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>
                  Enjoy a{" "}
                  <span className="text-gray-300 font-medium">
                    truly interactive interface
                  </span>
                  , no more copy-pasting.
                </span>
              </li>
              <li className="flex items-start md:items-center justify-center gap-2">
                <svg
                  className="w-4 h-4 text-accent flex-shrink-0 mt-1 md:mt-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>
                  Your conversation{" "}
                  <span className="text-gray-300 font-medium">
                    never loses context
                  </span>{" "}
                  or gets cut short.
                </span>
              </li>
            </ul>
          </div>
          {/* End: Pitch Section */}

          <input
            id="pdf-upload"
            type="file"
            accept=".pdf"
            ref={inputRef}
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {/* Background Image */}
        <div className="w-full h-full">
          <img
            src="./bg.png"
            alt="Hero Visual"
            className="rounded-3xl w-full h-full object-cover shadow-xl"
          />
        </div>
      </div>
    </div>
  );
}
