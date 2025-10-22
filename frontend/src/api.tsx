// frontend/src/api.ts
const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000";

export const api = {
  post: async (endpoint: string, data: any) => {
    const url = `${API_BASE_URL}${endpoint}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`API error: ${res.statusText}`);
    return res.json();
  },
};
