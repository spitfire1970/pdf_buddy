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
  pdfUrl: string | null;
  pdfLoading: boolean;
  highlights: Array<IHighlight>;
  setHighlights: (highlights: Array<IHighlight>) => void;
  addHighlight: (
    highlight: NewHighlight,
    callback?: (id: string) => void,
  ) => void;
  resetHighlights: () => void;
  incomplete: boolean;
  setIncomplete: (val: boolean) => void;
  // NEW: State for a highlight selected while a chat is open
  pendingHighlight: IHighlight | null;
  setPendingHighlight: (highlight: IHighlight | null) => void;
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
  // NEW: State for holding a highlight to be used as context in an existing chat.
  const [pendingHighlight, setPendingHighlight] = useState<IHighlight | null>(
    null,
  );

  useEffect(() => {
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
          responseType: "blob",
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

    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [selectedPdfId, token]);

  const selectPdf = useCallback((id: string | null) => {
    setSelectedPdfId(id);
    setHighlights([]);
    setPendingHighlight(null); // NEW: Clear pending highlight on PDF change
  }, []);

  // CHANGED: addHighlight can now accept a callback to get the new highlight's ID
  const addHighlight = useCallback(
    (highlight: NewHighlight, callback?: (id: string) => void) => {
      const newId = getNextId();
      const newHighlight = { ...highlight, id: newId };
      setHighlights((prev) => [newHighlight, ...prev]);
      if (callback) {
        callback(newId);
      }
    },
    [],
  );

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
    setIncomplete,
    pendingHighlight,
    setPendingHighlight,
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
