import { supabase } from "./supabase";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

export const api = {
  async get(endpoint: string) {
    const { data: { session } } = await supabase.auth.getSession();
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }

    const res = await fetch(`${BASE_URL}${endpoint}`, {
      headers,
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async post(endpoint: string, body: any) {
    const { data: { session } } = await supabase.auth.getSession();
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }

    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async upload(endpoint: string, formData: FormData) {
    const { data: { session } } = await supabase.auth.getSession();
    const headers: HeadersInit = {};
    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }
    // Note: Do NOT set Content-Type header for FormData, browser does it automatically with boundary

    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: "POST",
      headers,
      body: formData,
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
};
