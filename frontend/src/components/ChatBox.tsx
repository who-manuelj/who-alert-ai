import { useState, useRef, useEffect } from "react";
import type { ChangeEvent } from "react";
import axios from "axios";

interface ChatBoxProps {
  onResults: (result: string) => void;
  chatHistory: ChatMessage[];
  setChatHistory: (history: ChatMessage[]) => void;
}

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
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
    };

    const updatedHistory = [...chatHistory, userMessage];
    setIsLoading(true);

    try {
      const res = await axios.post<{ result: string }>(
        "http://localhost:5000/api/query",
        { messages: updatedHistory }
      );

      const aiResponse = res.data.result;

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: aiResponse,
      };

      const finalHistory = [...updatedHistory, assistantMessage];

      setChatHistory(finalHistory);
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

  return (
    <div className="chatbox">
      <div className="chat-history">
        {chatHistory
          .filter((msg) => msg.role !== "system")
          .map((msg, idx) => (
            <div key={idx} className={`chat-message ${msg.role}`}>
              <strong>{msg.role === "user" ? "You" : "AI"}:</strong>
              <p>{msg.content}</p>
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
