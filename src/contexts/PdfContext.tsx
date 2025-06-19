import { createContext, useState, useContext, useCallback } from "react";
import { type ReactNode } from "react";
import type { IHighlight, NewHighlight } from "react-pdf-highlighter";

const getNextId = () => String(Math.random()).slice(2);

interface PdfContextType {
  pdfUrl: string | null;
  highlights: Array<IHighlight>;
  uploadPdf: (file: File) => void;
  addHighlight: (highlight: NewHighlight) => void;
  resetHighlights: () => void;
  clearPdf: () => void;
}

const PdfContext = createContext<PdfContextType | undefined>(undefined);

export function PdfProvider({ children }: { children: ReactNode }) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [highlights, setHighlights] = useState<Array<IHighlight>>([]);

  const uploadPdf = useCallback(
    (file: File) => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
      const fileUrl = URL.createObjectURL(file);
      setPdfUrl(fileUrl);
      setHighlights([]);
    },
    [pdfUrl],
  );

  const clearPdf = useCallback(() => {
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
    }
    setPdfUrl(null);
    setHighlights([]);
  }, [pdfUrl]);

  const addHighlight = useCallback((highlight: NewHighlight) => {
    setHighlights((prev) => [{ ...highlight, id: getNextId() }, ...prev]);
  }, []);

  const resetHighlights = useCallback(() => {
    setHighlights([]);
  }, []);

  const value = {
    pdfUrl,
    highlights,
    uploadPdf,
    addHighlight,
    resetHighlights,
    clearPdf,
  };

  return <PdfContext.Provider value={value}>{children}</PdfContext.Provider>;
}

export function usePdf() {
  const context = useContext(PdfContext);
  if (context === undefined) {
    throw new Error("usePdf must be used within a PdfProvider");
  }
  return context;
}
