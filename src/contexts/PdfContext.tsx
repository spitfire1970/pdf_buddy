import {
  createContext,
  useState,
  useContext,
  useCallback,
  useEffect,
} from "react";
import { type ReactNode } from "react";
import type { IHighlight, NewHighlight } from "react-pdf-highlighter";
import axios from "axios";
import { useAuth } from "./AuthContext";

const getNextId = () => String(Math.random()).slice(2);
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface Pdf {
  id: string;
  filename: string;
  upload_date: string;
}

interface PdfContextType {
  pdfs: Pdf[];
  setPdfs: (pdfs: Pdf[]) => void;
  selectedPdfId: string | null;
  selectPdf: (id: string | null) => void;
  pdfUrl: string | null; // This will now be a local blob URL
  pdfLoading: boolean;
  highlights: Array<IHighlight>;
  setHighlights:(highlights:  Array<IHighlight>) => void;
  addHighlight: (highlight: NewHighlight) => void;
  resetHighlights: () => void;
  incomplete: boolean;
  setIncomplete: (val: boolean) => void;
}

const PdfContext = createContext<PdfContextType | undefined>(undefined);

export function PdfProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [pdfs, setPdfs] = useState<Pdf[]>([]);
  const [selectedPdfId, setSelectedPdfId] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState<boolean>(false);
  const [highlights, setHighlights] = useState<Array<IHighlight>>([]);
  const [incomplete, setIncomplete] = useState<boolean>(false);

  // Effect to fetch PDF blob when selectedPdfId changes
  useEffect(() => {
    // If there's an old blob URL, revoke it to prevent memory leaks
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
    }

    if (!selectedPdfId || !token) {
      setPdfUrl(null);
      return;
    }

    const fetchPdfBlob = async () => {
      setPdfLoading(true);
      try {
        const response = await axios.get(`${API_URL}/pdfs/${selectedPdfId}`, {
          headers: { Authorization: `Bearer ${token}` },
          responseType: "blob", // Important: we want the raw file data
        });
        const blob = new Blob([response.data], { type: "application/pdf" });
        const localUrl = URL.createObjectURL(blob);
        setPdfUrl(localUrl);
      } catch (error) {
        console.error("Failed to fetch PDF blob:", error);
        setPdfUrl(null);
      } finally {
        setPdfLoading(false);
      }
    };

    fetchPdfBlob();

    // Cleanup function to revoke the blob URL when the component unmounts
    // or when the dependency array changes before the next run.
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPdfId, token]);

  const selectPdf = useCallback((id: string | null) => {
    setSelectedPdfId(id);
    setHighlights([]);
  }, []);

  const addHighlight = useCallback((highlight: NewHighlight) => {
    setHighlights((prev) => [{ ...highlight, id: getNextId() }, ...prev]);
  }, []);

  const resetHighlights = useCallback(() => {
    setHighlights([]);
  }, []);

  const value = {
    pdfs,
    setPdfs,
    selectedPdfId,
    selectPdf,
    pdfUrl,
    pdfLoading,
    highlights,
    addHighlight,
    setHighlights,
    resetHighlights,
    incomplete,
    setIncomplete
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
