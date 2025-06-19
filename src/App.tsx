import { useState, useEffect, useCallback, useRef } from "react";

import {
  AreaHighlight,
  Highlight,
  PdfHighlighter,
  PdfLoader,
  Popup,
  Tip,
} from "react-pdf-highlighter";
import type {
  Content,
  IHighlight,
  NewHighlight,
  ScaledPosition,
} from "react-pdf-highlighter";

import { Sidebar } from "./Sidebar";
import { Spinner } from "./Spinner";
import { LandingPage } from "./LandingPage";

const getNextId = () => String(Math.random()).slice(2);

const parseIdFromHash = () =>
  document.location.hash.slice("#highlight-".length);

const resetHash = () => {
  document.location.hash = "";
};

const HighlightPopup = ({
  comment,
}: {
  comment: { text: string; emoji: string };
}) =>
  comment.text ? (
    <div className="Highlight__popup">
      {comment.emoji} {comment.text}
    </div>
  ) : null;

const AskInChatPopup = ({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) => {
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
  const [pdfUrl, setPdfUrl] = useState<string | null>(
    null,
  );
  const [highlights, setHighlights] = useState<Array<IHighlight>>([]);
  const [sidebarWidth, setSidebarWidth] = useState(400); // Initial width in pixels
  const isResizingRef = useRef(false);

  const handleFileUpload = (file: File) => {
    const fileUrl = URL.createObjectURL(file);
    setPdfUrl(fileUrl);
  };

  const resetHighlights = () => {
    setHighlights([]);
  };

  const scrollViewerTo = useRef((highlight: IHighlight) => {});

  const getHighlightById = (id: string) => {
    return highlights.find((highlight) => highlight.id === id);
  };

  const scrollToHighlightFromHash = useCallback(() => {
    const highlight = getHighlightById(parseIdFromHash());
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

  const addHighlight = (highlight: NewHighlight) => {
    setHighlights((prevHighlights) => [
      { ...highlight, id: getNextId() },
      ...prevHighlights,
    ]);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizingRef.current) {
      return;
    }
    const newWidth = window.innerWidth - e.clientX;
    // Set constraints for min and max width
    if (newWidth > 300 && newWidth < window.innerWidth * 0.7) {
      setSidebarWidth(newWidth);
    }
  }, []);

  const handleMouseUp = () => {
    isResizingRef.current = false;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };

  if (!pdfUrl) {
    return <LandingPage onFileUpload={handleFileUpload} />;
  }

  return (
    <div className="App flex h-screen">
      <div className="flex-1 relative h-screen">
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
              onSelectionFinished={(
                position,
                content,
                hideTipAndSelection,
              ) => (
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
              highlightTransform={(
                highlight,
                index,
                setTip,
                hideTip,
                viewportToScaled,
                screenshot,
                isScrolledTo,
              ) => {
                const isTextHighlight = !highlight.content?.image;

                const component = isTextHighlight ? (
                  <Highlight
                    isScrolledTo={isScrolledTo}
                    position={highlight.position}
                    comment={highlight.comment}
                  />
                ) : (
                  <AreaHighlight
                    isScrolledTo={isScrolledTo}
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

      {/* Resizer Handle */}
      <div
        className="w-2 cursor-col-resize bg-gray-300 hover:bg-gray-400 transition-colors"
        onMouseDown={handleMouseDown}
      />

      {/* Sidebar Wrapper */}
      <div style={{ width: `${sidebarWidth}px` }}>
        <Sidebar highlights={highlights} resetHighlights={resetHighlights} />
      </div>
    </div>
  );
}