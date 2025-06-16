import { useEffect, useRef, useState } from "react";
import type { IHighlight } from "react-pdf-highlighter";
import { ArrowLeft, SendHorizonal } from "lucide-react";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css"; // KaTeX CSS

interface Props {
  highlights: Array<IHighlight>;
  resetHighlights: () => void;
}

interface InputObject {
  id: string;
  content: {
    text?: string;
    image?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

interface CleanObject {
  id: string;
  type: "text" | "image";
  context: string;
}

function cleanUpObject(obj: InputObject): CleanObject {
  const { id, content } = obj;
  if (content.text) return { id, type: "text", context: content.text };
  if (content.image) return { id, type: "image", context: content.image };
  throw new Error("Invalid object: content must contain either text or image.");
}

interface ChatMessage {
  role: "user" | "model";
  parts: string[];
}

export function Sidebar({ highlights, resetHighlights }: Props) {
  const [view, setView] = useState<"list" | "chat">("list");
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string>("");
  const [chats, setChats] = useState<Record<string, ChatMessage[]>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const filtered_highlights = highlights.map((ele) => cleanUpObject(ele));

  useEffect(() => {
    if (highlights.length > 0) {
      const { id, type, context } = filtered_highlights[0];
      setActiveChatId(id);
      setView("chat");
      setChats((prev) => ({ ...prev, [id]: [] }));
    }
  }, [highlights]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chats, activeChatId]);

  const handleSend = async () => {
    if (!activeChatId || !prompt.trim()) return;

    const highlight = filtered_highlights.find((h) => h.id === activeChatId);
    if (!highlight) return;

    setChats((prev) => ({
      ...prev,
      [activeChatId]: [
        ...(prev[activeChatId] || []),
        { role: "user", parts: [prompt] },
      ],
    }));

    const endpoint =
      chats[activeChatId]?.length > 0 ? "/continue-chat/" : "/branch-chat/";

    try {
      const res = await fetch("http://localhost:8000" + endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeChatId,
          prompt,
          type: highlight.type,
          content: highlight.context,
        }),
      });
      const data = await res.json();
      if (data.history) {
        setChats((prev) => ({
          ...prev,
          [activeChatId]: data.history.slice(1),
        }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setPrompt("");
    }
  };

  return (
    <div className="w-[25vw] flex flex-col overflow-auto text-neutral-600 bg-gradient-to-b from-gray-100 to-gray-50">
      {view === "list" && (
        <div className="p-4">
          <h2 className="mb-4 text-xl font-semibold">Chats</h2>
          {Object.entries(chats).map(([id, history]) => (
            <div
              key={id}
              className="cursor-pointer border-b border-neutral-300 px-2 py-3 hover:bg-neutral-200"
              onClick={() => {
                setActiveChatId(id);
                setView("chat");
              }}
            >
              {history[0]?.parts[0]?.slice(0, 40) || "(new chat)"}...
            </div>
          ))}
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
                className={`p-3 rounded-md max-w-[80%] whitespace-pre-wrap prose prose-sm break-words ${
                  msg.role === "user" ? "bg-blue-100 ml-auto" : "bg-gray-200"
                }`}
              >
                {msg.parts.map((part, i) => (
                  <ReactMarkdown
                    key={i}
                    remarkPlugins={[remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={{
                      p: ({ children }) => <p className="my-1">{children}</p>,
                    }}
                  >
                    {part}
                  </ReactMarkdown>
                ))}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <div className="border-t flex items-center gap-2 p-2">
            <input
              className="flex-1 px-3 py-2 rounded border"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Type a message..."
            />
            <SendHorizonal
              className="text-accent cursor-pointer"
              onClick={handleSend}
            />
          </div>
        </div>
      )}

      {view === "list" && highlights.length > 0 && (
        <div className="p-4">
          <button
            type="button"
            onClick={resetHighlights}
            className="px-4 py-2 text-black bg-accent rounded hover:bg-accent/80"
          >
            Reset highlights
          </button>
        </div>
      )}
    </div>
  );
}
