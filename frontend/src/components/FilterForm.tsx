import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import axios from "axios";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
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

  const formatLabel = (key: string) => {
    const overrides: Record<string, string> = {
      publishedDateFrom: "Start Date",
      publishedDateTo: "End Date",
    };

    if (overrides[key]) return overrides[key];

    return key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
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
    };

    const updatedHistory = [...chatHistory, userMessage];

    try {
      const res = await axios.post<{ result: string }>(
        "http://localhost:5000/api/query",
        {
          messages: updatedHistory,
          filters, // Optional: backend can use this for extra filtering
        }
      );

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: res.data.result || "No results found.",
      };

      setChatHistory([...updatedHistory, assistantMessage]);
    } catch (error) {
      console.error("Error submitting filter search:", error);
      const errorMessage: ChatMessage = {
        role: "assistant",
        content: "An error occurred while processing your filter search.",
      };
      setChatHistory([...updatedHistory, errorMessage]);
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
        />
      ))}
      <button type="submit">Search</button>
    </form>
  );
};

export default FilterForm;
