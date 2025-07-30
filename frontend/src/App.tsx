import { useState } from "react";
import FilterForm from "./components/FilterForm";
import ChatBox from "./components/ChatBox";
import "./App.css";

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

function App() {
  const [chatResult, setChatResult] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      role: "system",
      content:
        "You are an AI assistant. You only answer based on WHO medical alerts. Do not invent answers.",
    },
  ]);

  return (
    <div className="app">
      <div className="left-panel panel">
        <h2>Search with Filters</h2>
        <FilterForm chatHistory={chatHistory} setChatHistory={setChatHistory} />
      </div>
      <div className="right-panel panel">
        <h2>Ask the WHO AI about Medical Product Alerts</h2>
        <ChatBox
          chatHistory={chatHistory}
          setChatHistory={setChatHistory}
          onResults={setChatResult}
        />
      </div>
    </div>
  );
}

export default App;
