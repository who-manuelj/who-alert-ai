import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { api } from "../api"; // adjust relative path

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
}

interface FilterProps {
  chatHistory: ChatMessage[];
  setChatHistory: (history: ChatMessage[]) => void;
}

interface Filters {
  productName: string;
  activeIngredient: string;
  publishedDateFrom: string;
  publishedDateTo: string;
  country: string;
  region: string;
  alertType: string;
  manufacturer: string;
  supplier: string;
  alertNumber: string;
}

const FilterForm = ({ chatHistory, setChatHistory }: FilterProps) => {
  const [filters, setFilters] = useState<Filters>({
    productName: "",
    activeIngredient: "",
    publishedDateFrom: "",
    publishedDateTo: "",
    country: "",
    region: "",
    alertType: "",
    manufacturer: "",
    supplier: "",
    alertNumber: "",
  });

  const [isLoading, setIsLoading] = useState(false); // <-- loading state

  const formatLabel = (key: string) => {
    const overrides: Record<string, string> = {
      publishedDateFrom: "Start Date",
      publishedDateTo: "End Date",
    };
    return (
      overrides[key] ||
      key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (str) => str.toUpperCase())
        .trim()
    );
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const filterText = Object.entries(filters)
      .filter(([_, value]) => value.trim() !== "")
      .map(([key, value]) => `${key}: ${value}`)
      .join(", ");

    const userMessage: ChatMessage = {
      role: "user",
      content: `Filter search with criteria — ${filterText}`,
      timestamp: new Date().toISOString(),
    };

    const updatedHistory = [...chatHistory, userMessage];
    setChatHistory(updatedHistory);
    setIsLoading(true); // <-- start loading

    try {
      const res = await api.post("/api/query", {
        messages: updatedHistory,
        filters,
      });

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: res.result || "No results found.",
        timestamp: res.timestamps?.ai || new Date().toISOString(),
      };

      setChatHistory([...updatedHistory, assistantMessage]);
    } catch (error) {
      console.error("Error submitting filter search:", error);
      const errorMessage: ChatMessage = {
        role: "assistant",
        content: "An error occurred while processing your filter search.",
        timestamp: new Date().toISOString(),
      };
      setChatHistory([...updatedHistory, errorMessage]);
    } finally {
      setIsLoading(false); // <-- stop loading
    }
  };

  return (
    <form onSubmit={handleSubmit} className="filter-form">
      {Object.keys(filters).map((key) => (
        <input
          key={key}
          name={key}
          placeholder={formatLabel(key)}
          type={key.toLowerCase().includes("date") ? "date" : "text"}
          onChange={handleChange}
          disabled={isLoading} // <-- disable inputs while loading
        />
      ))}
      <button type="submit" disabled={isLoading}>
        {isLoading ? "Searching..." : "Search"} {/* <-- show loading text */}
      </button>
    </form>
  );
};

export default FilterForm;
