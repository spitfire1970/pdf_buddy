import { useEffect, useState } from "react";
import type { IHighlight } from "react-pdf-highlighter";
import axios from "axios";
import { ArrowLeft } from "lucide-react";

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

interface ChatHistoryItem {
  role: string;
  parts: string[];
}

function cleanUpObject(obj: InputObject): CleanObject {
  const { id, content } = obj;

  if (content.text) {
    return { id, type: "text", context: content.text };
  }

  if (content.image) {
    return { id, type: "image", context: content.image };
  }

  throw new Error("Invalid object: content must contain either text or image.");
}

export function Sidebar({ highlights, resetHighlights }: Props) {
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chatHistories, setChatHistories] = useState<
    Record<string, ChatHistoryItem[]>
  >({});
  const [input, setInput] = useState("");
  const [chatList, setChatList] = useState<CleanObject[]>([]);

  useEffect(() => {
    const filtered = highlights.map(cleanUpObject);
    setChatList(filtered);

    if (filtered.length > 0) {
      const latest = filtered[0];
      if (!chatHistories[latest.id]) {
        setActiveChatId(latest.id);
        setChatHistories((prev) => ({ ...prev, [latest.id]: [] }));
      }
    }
  }, [highlights]);

  const handleSendPrompt = async () => {
    const current = chatList.find((c) => c.id === activeChatId);
    if (!current || !input.trim()) return;

    try {
      const res = await axios.post("http://localhost:8000/branch-chat/", {
        id: current.id,
        type: current.type,
        content: current.context,
        prompt: input,
      });

      setChatHistories((prev) => ({
        ...prev,
        [current.id]: res.data.history.slice(1),
      }));
      setInput("");
    } catch (err) {
      console.error("Branch chat failed", err);
    }
  };

  const handleContinueChat = async () => {
    if (!activeChatId || !input.trim()) return;

    try {
      const res = await axios.post("http://localhost:8000/continue-chat/", {
        id: activeChatId,
        prompt: input,
      });

      setChatHistories((prev) => ({
        ...prev,
        [activeChatId]: res.data.history.slice(1),
      }));
      setInput("");
    } catch (err) {
      console.error("Continue chat failed", err);
    }
  };

  const currentChat = activeChatId ? chatHistories[activeChatId] || [] : [];

  return (
    <div className="w-[25vw] h-full overflow-auto text-neutral-600 bg-gradient-to-b from-gray-100 to-gray-50 border-l">
      {!activeChatId ? (
        <div className="p-4">
          <h2 className="mb-4 text-xl font-semibold">Chats</h2>
          <ul className="list-none p-0">
            {chatList.map((chat, idx) => (
              <li
                key={idx}
                onClick={() => setActiveChatId(chat.id)}
                className="p-4 border-b border-neutral-500 cursor-pointer hover:bg-black/10"
              >
                <div className="text-sm font-medium">
                  {chat.context.slice(0, 50).trim()}...
                </div>
              </li>
            ))}
          </ul>
          {highlights.length > 0 && (
            <div className="pt-4">
              <button
                type="button"
                onClick={resetHighlights}
                className="px-4 py-2 text-white bg-red-500 rounded hover:bg-red-600"
              >
                Reset highlights
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-2 p-4 border-b">
            <ArrowLeft
              className="cursor-pointer"
              onClick={() => setActiveChatId(null)}
            />
            <h2 className="text-lg font-semibold">Chat</h2>
          </div>

          <div className="flex-1 overflow-auto p-4 space-y-3">
            {currentChat.map((item, idx) => (
              <div
                key={idx}
                className={`rounded p-2 text-sm whitespace-pre-wrap ${item.role === "user" ? "bg-blue-100" : "bg-gray-200"}`}
              >
                {item.parts.join("\n")}
              </div>
            ))}
          </div>

          <div className="p-4 border-t">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if ((chatHistories[activeChatId!] || []).length === 0) {
                    handleSendPrompt();
                  } else {
                    handleContinueChat();
                  }
                }
              }}
              placeholder="Ask about this section..."
              className="w-full p-2 border rounded"
            />
          </div>
        </div>
      )}
    </div>
  );
}
