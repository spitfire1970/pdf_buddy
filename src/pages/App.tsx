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
import { usePdf } from "../contexts/PdfContext";
import { useSidebarResizing } from "../hooks/useSidebarResizing";

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

// FIX: Restored the original AskInChatPopup with its keydown and click-outside logic.
// This is the correct way to handle this kind of temporary, event-driven UI.
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
      className="bg-main p-2 rounded-md shadow-lg border border-black-300"
    >
      <button
        onClick={onConfirm}
        className="px-3 py-1 bg-accent text-black text-sm font-semibold rounded-md hover:bg-accent/90 transition"
      >
        ask in chat
      </button>
    </div>
  );
};

export function App() {
  const { pdfUrl, highlights, addHighlight } = usePdf();
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

  if (!pdfUrl) {
    return <LandingPage />;
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
