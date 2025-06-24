import { useEffect, useRef, useState, useMemo } from "react";
import { ArrowLeft, SendHorizonal, Plus } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { usePdf } from "../contexts/PdfContext";
import { useAuth } from "../contexts/AuthContext";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface InputObject {
  id: string;
  content: { text?: string; image?: string };
}
interface CleanObject {
  id: string;
  type: "text" | "image";
  context: string;
}
interface ChatMessage {
  role: "user" | "model";
  parts: string[];
}

function cleanUpObject(obj: InputObject): CleanObject {
  const { id, content } = obj;
  if (content.text) return { id, type: "text", context: content.text };
  if (content.image) return { id, type: "image", context: content.image };
  throw new Error("Invalid object: content must contain either text or image.");
}

const latexOverflowFix = `
  .prose .katex-display {
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0.5em 0.2em;
  }
`;

export function Sidebar() {
  const { highlights, selectPdf, selectedPdfId, incomplete, setIncomplete } =
    usePdf();
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

  useEffect(() => {
    if (!incomplete) return;
    if (highlights.length > 0 && filtered_highlights.length > 0) {
      const latestHighlight = filtered_highlights[0];
      if (latestHighlight && !chats[latestHighlight.id]) {
        setActiveChatId(latestHighlight.id);
        setView("chat");
        setChats((prev) => ({ ...prev, [latestHighlight.id]: [] }));
        setIncomplete(false);
      }
    }
  }, [highlights, filtered_highlights, chats, incomplete, setIncomplete]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chats, activeChatId]);

  useEffect(() => {
    if (view === "chat") {
      setTimeout(() => inputRef.current?.focus(), 0);
      if (activeChatId) window.location.hash = "highlight-" + activeChatId;
    } else {
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    }
  }, [view, activeChatId]);

  const handleNewChat = () => {
    const newChatId = crypto.randomUUID();
    setChats((prev) => ({ ...prev, [newChatId]: [] }));
    setActiveChatId(newChatId);
    setView("chat");
  };

  const handleSend = async () => {
    if (!activeChatId || !prompt.trim() || !token || !selectedPdfId) return;

    const currentPrompt = prompt;
    setPrompt("");

    const highlight = filtered_highlights.find((h) => h.id === activeChatId);
    const actual_highlight = highlights.find((h) => h.id === activeChatId);

    const isGeneralChat = !highlight;
    const isNewChat = (chats[activeChatId]?.length || 0) < 1;

    if (isNewChat && !isGeneralChat && actual_highlight) {
      const saveHighlightAndCreateChat = async () => {
        try {
          console.log("idiot", actual_highlight);
          const { id: value, ...rest } = actual_highlight;
          await axios.post(
            `${API_URL}/pdfs/${selectedPdfId}/highlights`,
            { highlight_id_str: value, ...rest },
          );
        } catch (error) {
          console.error("Failed to save highlight:", error);
        }
      };
      saveHighlightAndCreateChat();
    }

    const endpoint = isNewChat ? "/branch-chat/" : "/continue-chat/";

    setChats((prev) => ({
      ...prev,
      [activeChatId]: [
        ...(prev[activeChatId] || []),
        { role: "user", parts: [currentPrompt] },
        { role: "model", parts: [""] },
      ],
    }));

    try {
      const res = await fetch(API_URL + endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pdf_id: selectedPdfId,
          id: activeChatId,
          prompt: currentPrompt,
          type: highlight ? highlight.type : "text",
          content: highlight ? highlight.context : "just use the entire document as context",
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
          parts: [`Sorry, an error occurred. Please try again.`],
        };
        return {
          ...prev,
          [activeChatId]: [...currentChat.slice(0, -1), updatedLastMessage],
        };
      });
    }
  };

  return (
    // NEW: Removed `overflow-auto` and added `overflow-hidden` to prevent the outer scrollbar
    <div className="w-full h-full flex flex-col overflow-hidden text-neutral-600 bg-gradient-to-b from-gray-100 to-gray-50">
      <style>{latexOverflowFix}</style>

      {view === "list" && (
        // NEW: This container now handles its own scrolling if the chat list is long
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
                const isHighlightChat = filtered_highlights.some(h => h.id === id);
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
                    {title.slice(0, 40)}...
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
        // NEW: This container uses `flex-1` and `min-h-0` to correctly size itself
        // within the main flex layout, which fixes the scrollbar issue.
        <div className="flex flex-col flex-1 min-h-0">
          {/* NEW: Header now includes the Plus icon */}
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
                className={`p-3 rounded-lg max-w-[85%] whitespace-pre-wrap prose prose-sm break-words ${
                  msg.role === "user" ? "bg-blue-100 ml-auto" : "bg-gray-200"
                }`}
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
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <div className="border-t flex items-center gap-2 p-2 bg-white">
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
      )}

      {/* NEW: `mt-auto` ensures this button is pushed to the very bottom */}
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