import { useEffect, useCallback, useRef } from "react";
import {
  AreaHighlight,
  Highlight,
  PdfHighlighter,
  PdfLoader,
  Popup,
} from "react-pdf-highlighter";
import type { IHighlight } from "react-pdf-highlighter";
import { Sidebar } from "../components/Sidebar";
import { Spinner } from "../components/Spinner";
import { LandingPage } from "./LandingPage";
import { Home } from "./Home";
import { useAuth } from "../contexts/AuthContext";
import { usePdf } from "../contexts/PdfContext";
import { useSidebarResizing } from "../hooks/useSidebarResizing";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const parseIdFromHash = () =>
  document.location.hash.slice("#highlight-".length);
const resetHash = () => {
  document.location.hash = "";
};

const HighlightPopup = ({
  comment,
}: { comment: { text: string; emoji: string } }) =>
  comment.text ? (
    <div className="Highlight__popup">
      {comment.emoji} {comment.text}
    </div>
  ) : null;

const AskInChatPopup = ({
  onConfirm,
  onCancel,
}: { onConfirm: () => void; onCancel: () => void }) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const onConfirmRef = useRef(onConfirm);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    onConfirmRef.current = onConfirm;
    onCancelRef.current = onCancel;
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        onConfirmRef.current();
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node)
      ) {
        onCancelRef.current();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div
      ref={popupRef}
      className="bg-accent p-1 rounded-md shadow-lg border border-black-300 cursor-pointer"
    >
      <button
        onClick={onConfirm}
        className="px-2 py-1 bg-accent text-black text-sm font-semibold rounded-md hover:bg-accent/90 transition cursor-pointer"
      >
        Ask in chat{" "}
        <kbd className="w-6 h-6 inline-flex items-center whitespace-nowrap rounded border border-gray-400 bg-gradient-to-b from-gray-200 to-gray-100 py-0.5 px-2 text-xs text-gray-800 shadow-sm">
          <a className="mw-selflink selflink">↵</a>
        </kbd>
      </button>
    </div>
  );
};

export function App() {
  const { user } = useAuth();
  // Get pdfUrl (now a blob url) and the new pdfLoading state
  const { pdfUrl, highlights, addHighlight, selectedPdfId, pdfLoading, setIncomplete, setHighlights } =
    usePdf();
  const { sidebarWidth, handleMouseDown } = useSidebarResizing(400);
  const scrollViewerTo = useRef<(highlight: IHighlight) => void>(() => {});

  const scrollToHighlightFromHash = useCallback(() => {
    const highlight = highlights.find((h) => h.id === parseIdFromHash());
    if (highlight) {
      scrollViewerTo.current(highlight);
    }
  }, [highlights]);

  useEffect(() => {
    window.addEventListener("hashchange", scrollToHighlightFromHash, false);
    return () => {
      window.removeEventListener(
        "hashchange",
        scrollToHighlightFromHash,
        false,
      );
    };
  }, [scrollToHighlightFromHash]);

  useEffect(() => {
  const fetchHighlights = async () => {
    if (!selectedPdfId || !pdfUrl) return;

    try {
      const response = await fetch(`${API_URL}/pdfs/${selectedPdfId}/highlights`);
      if (!response.ok) throw new Error("Failed to fetch highlights");
      const data = await response.json();
      setHighlights(data.map((obj: any) => {
  if ("highlight_id_str" in obj) {
    const { "highlight_id_str": value, ...rest } = obj;
    return {
      "id": value,
      ...rest,
    };
  }
  return obj; // Return the original object if the key is not found
}));
    } catch (error) {
      console.error("Error fetching highlights:", error);
    }
  };

  fetchHighlights();
  }, [selectedPdfId, pdfUrl]);

  if (!user) {
    return <LandingPage />;
  }

  // If no PDF is selected, show the dashboard.
  if (!selectedPdfId) {
    return <Home />;
  }

  // If a PDF is selected but the blob URL isn't ready yet, show a spinner.
  if (pdfLoading) {
    return <Spinner />;
  }

  // If a PDF was selected but the URL failed to load, direct back to the Dashboard.
  if (!pdfUrl) {
    // Optionally, you could show an error message here before redirecting.
    return <Home />;
  }

  return (
    <div className="App flex h-screen bg-gray-200">
      <div className="flex-1 relative h-screen overflow-y-auto">
        <PdfLoader url={pdfUrl} beforeLoad={<Spinner />}>
          {(pdfDocument) => (
            <PdfHighlighter
              pdfDocument={pdfDocument}
              enableAreaSelection={(event) => event.altKey}
              onScrollChange={resetHash}
              scrollRef={(scrollTo) => {
                scrollViewerTo.current = scrollTo;
                scrollToHighlightFromHash();
              }}
              onSelectionFinished={(position, content, hideTipAndSelection) => (
                <AskInChatPopup
                  onConfirm={() => {
                    addHighlight({
                      content,
                      position,
                      comment: { emoji: "🔥", text: "fire" },
                    });
                    setIncomplete(true)
                    hideTipAndSelection();
                  }}
                  onCancel={hideTipAndSelection}
                />
              )}
              highlightTransform={(highlight, index, setTip, hideTip) => {
                const isTextHighlight = !highlight.content?.image;
                const component = isTextHighlight ? (
                  <Highlight
                    isScrolledTo={false}
                    position={highlight.position}
                    comment={highlight.comment}
                  />
                ) : (
                  <AreaHighlight
                    isScrolledTo={false}
                    highlight={highlight}
                    onChange={() => {}}
                  />
                );
                return (
                  <Popup
                    popupContent={<HighlightPopup {...highlight} />}
                    onMouseOver={(popupContent) =>
                      setTip(highlight, () => popupContent)
                    }
                    onMouseOut={hideTip}
                    key={index}
                  >
                    {component}
                  </Popup>
                );
              }}
              highlights={highlights}
            />
          )}
        </PdfLoader>
      </div>

      <div
        className="w-2 cursor-col-resize bg-gray-400 hover:bg-gray-500 transition-colors"
        onMouseDown={handleMouseDown}
        aria-label="Resize sidebar"
      />

      <div style={{ width: `${sidebarWidth}px` }} className="flex-shrink-0">
        <Sidebar />
      </div>
    </div>
  );
}
