import { useState, useRef, useEffect } from "react";
import type { ChangeEvent } from "react";
import { api } from "../api"; // adjust relative path

interface ChatBoxProps {
  onResults: (result: string) => void;
  chatHistory: ChatMessage[];
  setChatHistory: (history: ChatMessage[]) => void;
}

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string; // <-- added timestamp
};

const ChatBox = ({ onResults, chatHistory, setChatHistory }: ChatBoxProps) => {
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const endOfMessagesRef = useRef<HTMLDivElement | null>(null);

  const handleChat = async () => {
    if (!message.trim()) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: message.trim(),
      timestamp: new Date().toISOString(), // timestamp at send time
    };

    const updatedHistory = [...chatHistory, userMessage];
    setChatHistory(updatedHistory);
    setIsLoading(true);

    try {
      const res = await api.post("/api/query", { messages: updatedHistory });
      const { result: aiResponse, timestamps } = res;

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: aiResponse,
        timestamp: timestamps.ai, // AI timestamp from backend
      };

      setChatHistory([...updatedHistory, assistantMessage]);
      onResults(aiResponse);
      setMessage("");
    } catch (error) {
      console.error("Failed to get AI response", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  const formatTimestamp = (iso?: string) =>
    iso ? new Date(iso).toLocaleTimeString() : "";

  return (
    <div className="chatbox">
      <div className="chat-history">
        {chatHistory
          .filter((msg) => msg.role !== "system")
          .map((msg, idx) => (
            <div key={idx} className={`chat-message ${msg.role}`}>
              <strong>{msg.role === "user" ? "You" : "AI"}:</strong>
              <p>
                {msg.content
                  .split("\n")
                  .map((line) => line.trimStart()) // remove extra spaces at line start
                  .join("\n")
                  .trim()}
              </p>
              {msg.timestamp && (
                <span className="timestamp">
                  {formatTimestamp(msg.timestamp)}
                </span>
              )}
            </div>
          ))}
        <div ref={endOfMessagesRef} />
      </div>

      <div className="chat-input">
        <textarea
          value={message}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
            setMessage(e.target.value)
          }
          placeholder="Ask a question about WHO medical product alerts..."
          disabled={isLoading}
        />
        <button onClick={handleChat} disabled={isLoading || !message.trim()}>
          {isLoading ? "Loading..." : "Send"}
        </button>
      </div>
    </div>
  );
};

export default ChatBox;
