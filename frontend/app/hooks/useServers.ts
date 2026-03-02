import { useQuery } from "@tanstack/react-query";
import { getServers } from "../lib/api";

export function useServers() {
  return useQuery({
    queryKey: ["servers"],
    queryFn: () => getServers(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
