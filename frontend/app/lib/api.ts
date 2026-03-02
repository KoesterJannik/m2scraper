import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Important for cookies
  headers: {
    "Content-Type": "application/json",
  },
});

export async function fetchUser() {
  try {
    const response = await apiClient.get("/api/users/me");
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        throw new Error("Unauthorized");
      }
      throw new Error(
        error.response?.data?.message || error.message || "Failed to fetch user"
      );
    }
    throw error;
  }
}
