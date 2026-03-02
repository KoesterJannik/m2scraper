import { useQuery } from "@tanstack/react-query";
import { searchPriceHistory, searchListings } from "../lib/api";
import type { MarketSearchParams } from "../lib/api";

export function usePriceHistory(params: MarketSearchParams = {}) {
  return useQuery({
    queryKey: ["priceHistory", params],
    queryFn: () => searchPriceHistory(params),
    staleTime: 30 * 1000,
  });
}

export function useListings(params: MarketSearchParams = {}) {
  return useQuery({
    queryKey: ["listings", params],
    queryFn: () => searchListings(params),
    staleTime: 30 * 1000,
  });
}
