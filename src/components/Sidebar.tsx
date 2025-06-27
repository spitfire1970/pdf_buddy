import { useEffect, useRef, useState, useMemo } from "react";
import { ArrowLeft, SendHorizonal, Plus, Paperclip, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { usePdf } from "../contexts/PdfContext";
import { useAuth } from "../contexts/AuthContext";
import axios from "axios";
import { Loader2 } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

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
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    }
  }, [view, setPendingHighlight, pendingHighlight, setIncomplete]);

  const handleNewChat = () => {
    const newChatId = crypto.randomUUID();
    setChats((prev) => ({ ...prev, [newChatId]: [] }));
    setActiveChatId(newChatId);
    setView("chat");
    setPendingHighlight(null);
  };

  const renderHighlightLink = (highlightId: string, statement: string) => (
    <a
      href={`#highlight-${highlightId}`}
      onClick={(e) => {
        e.preventDefault();
        window.location.hash = `#highlight-${highlightId}`;
      }}
      className="text-blue-600 hover:underline text-xs block mt-2"
    >
      {statement}
    </a>
  );

  const handleSend = async () => {
    if (
      !prompt.trim() || // design decision whether to allow sending pure context without prompt
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

    // **FIX 1: Only add the user's message. Do not add a "...thinking" message.**
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
    <div className="w-full h-full flex flex-col overflow-hidden text-neutral-600 bg-gradient-to-b from-gray-100 to-gray-50">
      <style>{latexOverflowFix}</style>
      {view === "list" && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex justify-between items-center p-4">
            <h2 className="text-xl font-semibold">Chats</h2>
            <Plus
              className="cursor-pointer text-neutral-500 hover:text-neutral-800"
              onClick={handleNewChat}
              size={24}
            />
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
                    className="cursor-pointer border-b border-neutral-300 px-2 py-3 hover:bg-neutral-200"
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
              <p className="text-gray-500 italic px-2">
                Highlight a section of the PDF to start a chat, or press the '+'
                icon for a general chat.<br></br>
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
          <div className="flex items-center justify-between gap-2 p-2 border-b bg-white">
            <div className="flex items-center gap-2">
              <ArrowLeft
                className="cursor-pointer"
                onClick={() => setView("list")}
              />
              <h3 className="text-lg font-medium">All Chats</h3>
            </div>
            <Plus
              className="cursor-pointer text-neutral-500 hover:text-neutral-800 mr-2"
              onClick={handleNewChat}
              size={24}
            />
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {(chats[activeChatId] || []).length === 0 ? (
              <p className="text-gray-500 italic px-2">
                At any point, add specific context to your chat by holding ⌥/alt
                and selecting an area!
              </p>
            ) : (
              (chats[activeChatId] || []).map((msg, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg max-w-[85%] whitespace-pre-wrap prose prose-sm break-words ${msg.role === "user" ? "bg-blue-100 ml-auto" : "bg-gray-200"}`}
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
                  {msg.role === "user" &&
                    msg.highlightId &&
                    renderHighlightLink(
                      msg.highlightId,
                      "View Attached Context",
                    )}
                </div>
              ))
            )}
            {isStreaming && (
              <div className="p-3 rounded-lg bg-gray-200 inline-flex items-center gap-2">
                <Loader2 className="animate-spin w-4 h-4 text-gray-600" />
                <span className="text-sm text-gray-600 italic">Thinking…</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="border-t p-2 bg-white">
            {pendingHighlight && (
              <div className="flex items-center justify-between bg-blue-100 text-blue-800 text-sm font-semibold px-3 py-1.5 mb-2 rounded-md">
                <div className="flex justify-center items-center">
                  <Paperclip className="inline-block h-4 w-4 mr-2" />
                  {renderHighlightLink(
                    pendingHighlight.id,
                    "Context from highlight attached.",
                  )}
                </div>
                <button
                  onClick={() => {
                    setHighlights(
                      highlights.filter((h) => h.id !== pendingHighlight?.id),
                    );
                    setPendingHighlight(null);
                  }}
                  className="text-blue-800 hover:text-blue-900"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <textarea
                ref={inputRef}
                className="scrollbar scrollbar-thumb-red-500 scrollbar-track-accent flex-1 resize-none max-h-48 overflow-y-auto px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray"
                rows={1}
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
                className={`text-accent cursor-pointer ml-2 ${isStreaming ? "opacity-50 cursor-not-allowed" : "hover:text-accent/80"}`}
                onClick={() => {
                  if (!isStreaming) handleSend();
                }}
              />
            </div>
          </div>
        </div>
      )}
      <div className="p-4 mt-auto border-t">
        <button
          type="button"
          onClick={() => {
            selectPdf(null);
            setIncomplete(false);
            setPendingHighlight(null);
          }}
          className="w-full px-4 py-2 text-white font-semibold bg-gray-600 rounded hover:bg-gray-700"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}
