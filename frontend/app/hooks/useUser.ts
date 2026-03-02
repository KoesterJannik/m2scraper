import { useQuery } from "@tanstack/react-query";
import { fetchUser } from "../lib/api";

export function useUser() {
  return useQuery({
    queryKey: ["user"],
    queryFn: fetchUser,
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
