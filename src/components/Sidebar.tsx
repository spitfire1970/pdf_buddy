import { useEffect, useRef, useState, useMemo } from "react";
import {
  ArrowLeft,
  SendHorizonal,
  Paperclip,
  X,
  ArrowRight,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { usePdf } from "../contexts/PdfContext";
import { useAuth } from "../contexts/AuthContext";
import axios from "axios";
import { Loader2 } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL;

interface IHighlightObject {
  id: string;
  content: { text?: string; image?: string };
}

interface CleanHighlight {
  id: string;
  type: "text" | "image";
  context: string;
}

interface ChatMessage {
  role: "user" | "model";
  parts: string[];
  highlightId?: string;
}

function cleanUpObject(obj: IHighlightObject): CleanHighlight {
  const { id, content } = obj;
  if (content.text) return { id, type: "text", context: content.text };
  if (content.image) return { id, type: "image", context: content.image };
  throw new Error("Invalid object: content must contain either text or image.");
}

const latexOverflowFix = `.prose .katex-display {
     overflow-x: auto;
     overflow-y: hidden;
     padding: 0.5em 0.2em;
   };`;

export function Sidebar() {
  const {
    highlights,
    selectPdf,
    selectedPdfId,
    incomplete,
    setIncomplete,
    setHighlights,
    pendingHighlight,
    setPendingHighlight,
  } = usePdf();
  const { token } = useAuth();
  const [view, setView] = useState<"list" | "chat">("list");
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string>("");
  const [chats, setChats] = useState<Record<string, ChatMessage[]>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const filtered_highlights = useMemo(
    () => highlights.map(cleanUpObject),
    [highlights],
  );

  useEffect(() => {
    const fetchChats = async () => {
      if (!token || !selectedPdfId) {
        setChats({});
        return;
      }
      try {
        const res = await axios.get(`${API_URL}/pdf-chats/${selectedPdfId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setChats(res.data);
      } catch (err) {
        console.error("Failed to fetch chats:", err);
        setChats({});
      }
    };
    fetchChats();
  }, [selectedPdfId, token]);

  useEffect(() => {
    if (view === "list" && pendingHighlight) {
      const newChatId = pendingHighlight.id;
      if (!chats[newChatId]) {
        setActiveChatId(newChatId);
        setView("chat");
        setChats((prev) => ({ ...prev, [newChatId]: [] }));
      }
      setIncomplete(false);
    }
  }, [pendingHighlight, chats, setIncomplete, setPendingHighlight, view]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chats, activeChatId, isStreaming]);

  useEffect(() => {
    if (pendingHighlight || view === "chat") {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setPendingHighlight(null);
      setIncomplete(false);
      setPrompt("");
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    }
  }, [view, setPendingHighlight, pendingHighlight, setIncomplete]);

  const NewChatAndDashboard = () => (
    <>
      <button
        onClick={handleNewChat}
        className="px-4 text-lg border-1 border-accent-400 font-medium text-accent-50 bg-accent-700 rounded-lg hover:bg-accent-800"
      >
        New Chat
      </button>
      <div className="flex items-center gap-2">
        <h3
          className="text-lg font-medium text-accent-50 cursor-pointer hover:text-accent-100"
          onClick={() => {
            selectPdf(null);
            setIncomplete(false);
            setPendingHighlight(null);
          }}
        >
          Dashboard
        </h3>
        <ArrowRight
          className="cursor-pointer text-accent-400 hover:text-accent-200"
          onClick={() => {
            selectPdf(null);
            setIncomplete(false);
            setPendingHighlight(null);
          }}
        />
      </div>
    </>
  );

  const handleNewChat = () => {
    const newChatId = crypto.randomUUID();
    setChats((prev) => ({ ...prev, [newChatId]: [] }));
    setActiveChatId(newChatId);
    setView("chat");
    setPendingHighlight(null);
  };

  const renderHighlightLink = (
    highlightId: string,
    statement: string,
    className: string,
  ) => (
    <a
      href={`#highlight-${highlightId}`}
      onClick={(e) => {
        e.preventDefault();
        window.location.hash = `#highlight-${highlightId}`;
      }}
      // The <a> tag is now the flex container.
      // We combine the layout classes with the styling classes passed via the prop.
      className={`flex items-center ${className}`}
    >
      <Paperclip className="h-4 w-4 mr-2 flex-shrink-0" />
      <span>{statement}</span>
    </a>
  );

  const handleSend = async () => {
    if (
      !prompt.trim() ||
      isStreaming ||
      !activeChatId ||
      !token ||
      !selectedPdfId
    )
      return;

    const currentPrompt = prompt;
    setPrompt("");
    setIsStreaming(true);

    const actual_highlight = pendingHighlight;

    const userMessage: ChatMessage = {
      role: "user",
      parts: [currentPrompt],
      highlightId: actual_highlight?.id,
    };

    setChats((prev) => ({
      ...prev,
      [activeChatId]: [...(prev[activeChatId] || []), userMessage],
    }));

    if (actual_highlight && actual_highlight.id) {
      try {
        const { id: value, ...rest } = actual_highlight;
        await axios.post(`${API_URL}/pdfs/${selectedPdfId}/highlights`, {
          highlight_id_str: value,
          ...rest,
        });
      } catch (error) {
        console.error("Failed to save highlight:", error);
      }
    }
    setPendingHighlight(null);

    try {
      const sending_obj = actual_highlight
        ? cleanUpObject(actual_highlight)
        : null;
      const res = await fetch(API_URL + "/branched-chat/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pdf_id: selectedPdfId,
          id: activeChatId,
          prompt: currentPrompt,
          highlight_id: actual_highlight?.id,
          type: sending_obj ? sending_obj.type : "text",
          content: sending_obj
            ? sending_obj.context
            : "just use the entire document as context",
        }),
      });

      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      if (!res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let completeText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        completeText += chunk;

        setChats((prev) => {
          const currentChat = prev[activeChatId] || [];
          const lastMessage = currentChat[currentChat.length - 1];

          if (lastMessage && lastMessage.role === "model") {
            const updatedLastMessage = {
              ...lastMessage,
              parts: [completeText],
            };
            return {
              ...prev,
              [activeChatId]: [...currentChat.slice(0, -1), updatedLastMessage],
            };
          } else {
            const newModelMessage: ChatMessage = {
              role: "model",
              parts: [completeText],
            };
            return {
              ...prev,
              [activeChatId]: [...currentChat, newModelMessage],
            };
          }
        });
      }
    } catch (e) {
      console.error(e);
      setChats((prev) => {
        const currentChat = prev[activeChatId] || [];
        const errorMessage: ChatMessage = {
          role: "model",
          parts: ["Sorry, an error occurred. Please try again."],
        };
        return {
          ...prev,
          [activeChatId]: [...currentChat, errorMessage],
        };
      });
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col overflow-hidden text-accent-50 bg-accent-950">
      <style>{latexOverflowFix}</style>
      {view === "list" && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex justify-between items-center px-4 py-2 border-b border-neutral-700">
            <h2 className="text-xl font-semibold text-accent-50">Chats</h2>
            <NewChatAndDashboard />
          </div>
          <div className="px-4 overflow-y-auto">
            {Object.keys(chats).length > 0 ? (
              Object.entries(chats).map(([id, history]) => {
                const isHighlightChat = filtered_highlights.some(
                  (h) => h.id === id,
                );
                const firstUserMessage = history.find((m) => m.role === "user");
                const title =
                  firstUserMessage?.parts[0] ||
                  (isHighlightChat
                    ? `Chat about highlight ${id.slice(0, 5)}`
                    : "New Chat");
                return (
                  <div
                    key={id}
                    className="cursor-pointer border-b border-accent-800 px-2 py-3 hover:bg-accent-800 rounded-lg my-1"
                    onClick={() => {
                      setActiveChatId(id);
                      setView("chat");
                    }}
                  >
                    {title.length < 80 ? title : `${title.slice(0, 80)}...`}
                  </div>
                );
              })
            ) : (
              <p className="text-neutral-400 italic font-medium px-2 mt-4">
                Highlight a section of the PDF to start a chat, or press the
                'New Chat' button.<br></br>
                <br></br>
                At any point, add specific context to your chat by holding ⌥/alt
                and selecting an area!
              </p>
            )}
          </div>
        </div>
      )}
      {view === "chat" && activeChatId && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between gap-2 p-2 border-b border-neutral-700 bg-accent-950">
            <div className="flex items-center gap-2">
              <ArrowLeft
                className="cursor-pointer text-accent-400 hover:text-accent-200"
                onClick={() => setView("list")}
              />
              <h3
                className="text-lg font-medium text-accent-50 cursor-pointer hover:text-accent-100"
                onClick={() => setView("list")}
              >
                All Chats
              </h3>
            </div>
            <NewChatAndDashboard />
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {(chats[activeChatId] || []).length === 0 ? (
              <p className="text-neutral-400 italic font-medium px-2">
                At any point, add specific context to your chat by holding ⌥/alt
                and selecting an area!
              </p>
            ) : (
              (chats[activeChatId] || []).map((msg, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg max-w-[85%] whitespace-pre-wrap prose prose-sm break-words ${msg.role === "user" ? "bg-accent-700 ml-auto" : "bg-neutral-800"}`}
                >
                  {msg.parts.map((part, i) => (
                    <ReactMarkdown
                      key={i}
                      remarkPlugins={[remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                      components={{ p: "span" }}
                    >
                      {part}
                    </ReactMarkdown>
                  ))}
                  {msg.role === "user" && msg.highlightId && (
                    <div className="mt-2">
                      {renderHighlightLink(
                        msg.highlightId,
                        "View Attached Context",
                        "text-accent-200 hover:underline text-sm",
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
            {isStreaming && (
              <div className="p-3 rounded-lg bg-neutral-700 inline-flex items-center gap-2">
                <Loader2 className="animate-spin w-4 h-4 text-accent-300" />
                <span className="text-sm text-neutral-300 italic">
                  Thinking…
                </span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="border-t border-neutral-700 p-2 bg-accent-950">
            {pendingHighlight && (
              <div className="flex items-center justify-between bg-accent-900 text-accent-300 text-sm font-semibold px-3 py-1.5 mb-2 rounded-md">
                <div className="flex items-center">
                  {renderHighlightLink(
                    pendingHighlight.id,
                    "Context from highlight attached",
                    "text-accent-300 hover:underline text-sm",
                  )}
                </div>
                <button
                  onClick={() => {
                    setHighlights(
                      highlights.filter((h) => h.id !== pendingHighlight?.id),
                    );
                    setPendingHighlight(null);
                  }}
                  className="text-accent-300 hover:text-accent-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-2 mb-1">
              <textarea
                ref={inputRef}
                className="scrollbar scrollbar-thumb-main-500 scrollbar-track-neutral-800 flex-1 resize-none max-h-48 overflow-y-auto px-2 py-2 rounded-md border border-neutral-700 bg-accent-700 text-accent-50 focus:outline-none focus:ring-1 focus:ring-accent-200"
                rows={2}
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !incomplete &&
                    !isStreaming
                  ) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask anything about the document"
              />
              <SendHorizonal
                className={`text-accent-400 cursor-pointer ml-1 mr-2 ${isStreaming ? "opacity-50 cursor-not-allowed" : "hover:text-accent-200"} ${prompt ? "animate-bounce" : ""}`}
                onClick={() => {
                  if (!isStreaming) handleSend();
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
