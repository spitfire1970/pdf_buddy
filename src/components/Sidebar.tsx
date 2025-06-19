import { useEffect, useRef, useState, useMemo } from "react";
import { ArrowLeft, SendHorizonal } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { usePdf } from "../contexts/PdfContext";
import { useAuth } from "../contexts/AuthContext";

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
  // FIX: Destructure selectedPdfId from the usePdf hook
  const { highlights, selectPdf, selectedPdfId } = usePdf();
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
    if (highlights.length > 0 && filtered_highlights.length > 0) {
      const latestHighlight = filtered_highlights[0];
      if (latestHighlight && !chats[latestHighlight.id]) {
        setActiveChatId(latestHighlight.id);
        setView("chat");
        setChats((prev) => ({ ...prev, [latestHighlight.id]: [] }));
      }
    }
  }, [highlights, filtered_highlights, chats]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chats, activeChatId]);

  useEffect(() => {
    if (view === "chat") {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [view, activeChatId]);

  const handleSend = async () => {
    // FIX: Add a guard to ensure we have a selectedPdfId before sending
    if (!activeChatId || !prompt.trim() || !token || !selectedPdfId) return;

    const currentPrompt = prompt;
    setPrompt("");

    const highlight = filtered_highlights.find((h) => h.id === activeChatId);
    if (!highlight) return;

    setChats((prev) => ({
      ...prev,
      [activeChatId]: [
        ...(prev[activeChatId] || []),
        { role: "user", parts: [currentPrompt] },
        { role: "model", parts: [""] },
      ],
    }));

    const endpoint =
      (chats[activeChatId]?.length || 0) > 1
        ? "/continue-chat/"
        : "/branch-chat/";

    try {
      const res = await fetch("http://localhost:8000" + endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        // FIX: Add the required 'pdf_id' to the request body
        body: JSON.stringify({
          pdf_id: selectedPdfId,
          id: activeChatId,
          prompt: currentPrompt,
          type: highlight.type,
          content: highlight.context,
        }),
      });
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setChats((prev) => {
          const newChatsForId = prev[activeChatId].map((msg, index) => {
            if (index === prev[activeChatId].length - 1) {
              return { ...msg, parts: [msg.parts[0] + chunk] };
            }
            return msg;
          });
          return { ...prev, [activeChatId]: newChatsForId };
        });
      }
    } catch (e) {
      console.error(e);
      // Handle error state
    }
  };

  return (
    <div className="w-full h-full flex flex-col overflow-auto text-neutral-600 bg-gradient-to-b from-gray-100 to-gray-50">
      <style>{latexOverflowFix}</style>

      {view === "list" && (
        <div className="flex-1 p-4">
          <h2 className="mb-4 text-xl font-semibold">Chats</h2>
          {Object.keys(chats).length > 0 ? (
            Object.entries(chats).map(([id, history]) => (
              <div
                key={id}
                className="cursor-pointer border-b border-neutral-300 px-2 py-3 hover:bg-neutral-200"
                onClick={() => {
                  setActiveChatId(id);
                  setView("chat");
                }}
              >
                {history[0]?.parts[0]?.slice(0, 40) ||
                  `Chat about highlight ${id.slice(0, 5)}`}
                ...
              </div>
            ))
          ) : (
            <p className="text-gray-500 italic">
              Highlight a section of the PDF to start a chat. Hold ⌥ and drag 
            </p>
          )}
        </div>
      )}

      {view === "chat" && activeChatId && (
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-2 p-2 border-b bg-white">
            <ArrowLeft
              className="cursor-pointer"
              onClick={() => setView("list")}
            />
            <h3 className="text-lg font-medium">Chat</h3>
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