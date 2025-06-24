import { useEffect, useRef, useState, useMemo } from "react";
import { ArrowLeft, SendHorizonal, Plus, Paperclip, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { usePdf } from "../contexts/PdfContext";
import { useAuth } from "../contexts/AuthContext";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Interface for raw highlight object from context
interface IHighlightObject {
  id: string;
  content: { text?: string; image?: string };
}
// Interface for cleaned up object
interface CleanHighlight {
  id: string;
  type: "text" | "image";
  context: string;
}
// CHANGED: ChatMessage now includes an optional highlightId
interface ChatMessage {
  role: "user" | "model";
  parts: string[];
  highlightId?: string; // To link a message to a highlight
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
  const inputRef = useRef<HTMLInputElement>(null);

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

  // CHANGED: This effect now conditionally starts a new chat.
  useEffect(() => {
    // Only trigger a new chat if a highlight was just made (`incomplete`)
    // AND we are in the "list" view.
    if (incomplete && view === "list" && pendingHighlight) {
      const newChatId = pendingHighlight.id;
      if (!chats[newChatId]) {
        setActiveChatId(newChatId);
        setView("chat");
        setChats((prev) => ({ ...prev, [newChatId]: [] }));
      }
      setIncomplete(false);
    } else if (incomplete) {
      // If we are in "chat" view, we don't start a new chat. We just acknowledge
      // the action is done and wait for the user to send a prompt.
      setIncomplete(false);
    }
  }, [
    incomplete,
    view,
    pendingHighlight,
    chats,
    setIncomplete,
    setPendingHighlight,
  ]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chats, activeChatId]);

  useEffect(() => {
    if (pendingHighlight) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else if (view === "chat") {
      setTimeout(() => inputRef.current?.focus(), 0);
      // We no longer automatically set the hash here, this is now driven by user clicks.
    } else {
      // When returning to the list, clear any pending highlight and reset the hash.
      setPendingHighlight(null);
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    }
  }, [view, activeChatId, setPendingHighlight, pendingHighlight]);

  const handleNewChat = () => {
    const newChatId = crypto.randomUUID();
    setChats((prev) => ({ ...prev, [newChatId]: [] }));
    setActiveChatId(newChatId);
    setView("chat");
    setPendingHighlight(null); // Ensure no highlight is attached to a new general chat
  };

  // NEW: Function to render the hyperlink for a message if it has a highlightId
  const renderHighlightLink = (highlightId: string) => (
    <a
      href={`#highlight-${highlightId}`}
      onClick={(e) => {
        e.preventDefault(); // Prevent full page reload
        window.location.hash = `highlight-${highlightId}`;
      }}
      className="text-blue-600 hover:underline text-xs block mt-2"
    >
      View Attached Context
    </a>
  );

  const handleSend = async () => {
    if (
      !activeChatId ||
      (!prompt.trim() && !pendingHighlight) ||
      !token ||
      !selectedPdfId
    )
      return;

    const currentPrompt = prompt;
    setPrompt("");

    // Use the pending highlight if it exists, otherwise find from activeChatId
    const contextHighlight = pendingHighlight;
    const actual_highlight = pendingHighlight;
    setPendingHighlight(null);

    const userMessage: ChatMessage = {
      role: "user",
      parts: [currentPrompt],
      // Attach the highlight ID to the message for future reference
      highlightId: contextHighlight?.id,
    };

    setChats((prev) => ({
      ...prev,
      [activeChatId]: [
        ...(prev[activeChatId] || []),
        userMessage,
        { role: "model", parts: [""] },
      ],
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

    // After using the pending highlight, clear it.
    if (pendingHighlight) {
      setPendingHighlight(null);
    }

    try {
      const sening_obj = actual_highlight
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
          // NEW: Send highlight ID to the backend
          highlight_id: contextHighlight?.id,
          // Provide context details only if a highlight is associated with this message
          type: sening_obj ? sening_obj.type : "text",
          content: sening_obj
            ? sening_obj.context
            : "just use the entire document as context",
        }),
      });

      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      if (!res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setChats((prev) => {
          const currentChat = prev[activeChatId] || [];
          if (currentChat.length === 0) return prev;
          const updatedLastMessage = {
            ...currentChat[currentChat.length - 1],
            parts: [currentChat[currentChat.length - 1].parts[0] + chunk],
          };
          return {
            ...prev,
            [activeChatId]: [...currentChat.slice(0, -1), updatedLastMessage],
          };
        });
      }
    } catch (e) {
      console.error(e);
      setChats((prev) => {
        const currentChat = prev[activeChatId] || [];
        if (currentChat.length === 0) return prev;
        const updatedLastMessage = {
          ...currentChat[currentChat.length - 1],
          parts: ["Sorry, an error occurred. Please try again."],
        };
        return {
          ...prev,
          [activeChatId]: [...currentChat.slice(0, -1), updatedLastMessage],
        };
      });
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
                icon for a general chat.
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
              <h3 className="text-lg font-medium">Chat</h3>
            </div>
            <Plus
              className="cursor-pointer text-neutral-500 hover:text-neutral-800 mr-2"
              onClick={handleNewChat}
              size={24}
            />
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {(chats[activeChatId] || []).map((msg, idx) => (
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
                {/* NEW: Render the hyperlink if the message is linked to a highlight */}
                {msg.role === "user" &&
                  msg.highlightId &&
                  renderHighlightLink(msg.highlightId)}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <div className="border-t p-2 bg-white">
            {/* NEW: UI element to show that a highlight's context is attached */}
            {pendingHighlight && (
              <div className="flex items-center justify-between bg-blue-100 text-blue-800 text-sm font-semibold px-3 py-1.5 mb-2 rounded-md">
                <span>
                  <Paperclip className="inline-block h-4 w-4 mr-2" />
                  Context from highlight attached.
                </span>
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
              <input
                ref={inputRef}
                className="flex-1 px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Type a message..."
              />
              <SendHorizonal
                className="text-accent cursor-pointer hover:text-accent/80"
                onClick={handleSend}
              />
            </div>
          </div>
        </div>
      )}

      <div className="p-4 mt-auto border-t">
        <button
          type="button"
          onClick={() => selectPdf(null)}
          className="w-full px-4 py-2 text-white font-semibold bg-gray-600 rounded hover:bg-gray-700"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}
