import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

export async function fetchUser() {
  try {
    const response = await apiClient.get("/api/users/me");
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) throw new Error("Unauthorized");
      throw new Error(error.response?.data?.message || error.message || "Failed to fetch user");
    }
    throw error;
  }
}

// ── Price History (aggregated, from DB) ──

export interface PriceHistoryItem {
  id: number;
  vnum: number;
  serverId: number;
  name: string;
  description?: string | null;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  totalListings: number;
  totalQuantity: number;
  fetchedAt: string;
  change24h: number | null;
  change7d: number | null;
  change30d: number | null;
}

export interface MarketSearchParams {
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  serverId?: number;
  category?: string;
  attrs?: string; // pipe-separated: "name1:value1|name2:value2"
  minLevel?: number;
  maxLevel?: number;
  limit?: number;
  offset?: number;
  sortBy?: "price" | "vnum" | "name" | "seller";
  sortOrder?: "asc" | "desc";
}

export interface PriceHistorySearchResponse {
  items: PriceHistoryItem[];
  pagination: { total: number; limit: number; offset: number; hasMore: boolean };
}

export async function searchPriceHistory(params: MarketSearchParams = {}): Promise<PriceHistorySearchResponse> {
  try {
    const response = await apiClient.get("/api/market/items", { params });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) throw new Error(error.response?.data?.error || error.message || "Failed to search");
    throw error;
  }
}

// ── Live Listings (full items, from JSON) ──

export interface MarketListing {
  id: number;
  vnum: number;
  name: string;
  nameGerman: string;
  description: string;
  seller: string;
  price: number; // unit price in won (1 won = 100M yang)
  quantity: number;
  category: string;
  job: number;
  attrs: Array<{ statId: number; value: number; description: string }>;
  sockets: number[];
  set: number;
  setGerman?: string;
  serverId: number;
  serverName: string;
  fetchedAt: string;
}

export interface ListingSearchResponse {
  items: MarketListing[];
  pagination: { total: number; limit: number; offset: number; hasMore: boolean };
}

export async function searchListings(params: MarketSearchParams = {}): Promise<ListingSearchResponse> {
  try {
    const response = await apiClient.get("/api/market/listings", { params });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) throw new Error(error.response?.data?.error || error.message || "Failed to search listings");
    throw error;
  }
}

// ── Common ──

export async function getPriceHistory(vnum: number, serverId?: number): Promise<{ name: string; description?: string; history: any[] }> {
  try {
    const response = await apiClient.get(`/api/market/price-history/${vnum}`, {
      params: serverId ? { serverId } : {},
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) throw new Error(error.response?.data?.error || error.message || "Failed to fetch price history");
    throw error;
  }
}

export async function getServers(): Promise<{ servers: any[] }> {
  try {
    const response = await apiClient.get("/api/market/servers");
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) throw new Error(error.response?.data?.error || error.message || "Failed to fetch servers");
    throw error;
  }
}

export async function suggestItemNames(query: string): Promise<string[]> {
  try {
    const response = await apiClient.get("/api/market/suggest-names", { params: { q: query } });
    return response.data.names;
  } catch {
    return [];
  }
}

export async function getAttributeNames(): Promise<string[]> {
  try {
    const response = await apiClient.get("/api/market/attribute-names");
    return response.data.names;
  } catch {
    return [];
  }
}

// ── Bookmarks ──

export interface Bookmark {
  id: number;
  userId: string;
  vnum: number;
  sellerName: string;
  itemName: string;
  serverId: number | null;
  createdAt: string;
}

export async function getBookmarks(): Promise<Bookmark[]> {
  const response = await apiClient.get("/api/bookmarks");
  return response.data.bookmarks;
}

export async function addBookmark(data: { vnum: number; sellerName: string; itemName: string; serverId?: number }): Promise<Bookmark> {
  const response = await apiClient.post("/api/bookmarks", data);
  return response.data.bookmark;
}

export async function removeBookmark(id: number): Promise<void> {
  await apiClient.delete(`/api/bookmarks/${id}`);
}

// ── Price Alerts ──

export interface PriceAlert {
  id: number;
  userId: string;
  vnum: number;
  serverId: number;
  itemName: string;
  priceThreshold: number;
  direction: "above" | "below";
  active: boolean;
  lastTriggeredAt: string | null;
  createdAt: string;
}

export async function getAlerts(): Promise<PriceAlert[]> {
  const response = await apiClient.get("/api/alerts");
  return response.data.alerts;
}

export async function createAlert(data: { vnum: number; serverId: number; itemName: string; priceThreshold: number; direction: string }): Promise<PriceAlert> {
  const response = await apiClient.post("/api/alerts", data);
  return response.data.alert;
}

export async function deleteAlert(id: number): Promise<void> {
  await apiClient.delete(`/api/alerts/${id}`);
}

export async function toggleAlert(id: number): Promise<PriceAlert> {
  const response = await apiClient.patch(`/api/alerts/${id}/toggle`);
  return response.data.alert;
}

