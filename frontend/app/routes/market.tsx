import type { Route } from "./+types/market";
import { AuthGuard } from "../components/AuthGuard";
import { DashboardNavbar } from "../components/DashboardNavbar";
import { PriceHistoryPopup } from "../components/PriceHistoryPopup";
import { AutocompleteInput } from "../components/AutocompleteInput";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePriceHistory, useListings } from "../hooks/useMarketItems";
import { useServers } from "../hooks/useServers";
import { useSearchParams as useRouterSearchParams } from "react-router";
import type { MarketSearchParams } from "../lib/api";
import { suggestItemNames, getAttributeNames } from "../lib/api";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Market" },
    { name: "description", content: "Metin2 Market Search" },
  ];
}

const YANG_PER_WON = 100_000_000;

function formatWon(price: number): string {
  if (price <= 0) return "-";
  if (price >= 1000) return price.toLocaleString("de-DE", { maximumFractionDigits: 0 }) + " Won";
  if (price >= 1) return price.toLocaleString("de-DE", { maximumFractionDigits: 2 }) + " Won";
  return price.toLocaleString("de-DE", { maximumFractionDigits: 4 }) + " Won";
}

function formatYang(wonPrice: number): string {
  if (wonPrice <= 0) return "";
  const yang = wonPrice * YANG_PER_WON;
  if (yang >= 1_000_000_000) return (yang / 1_000_000_000).toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " Mrd Yang";
  if (yang >= 1_000_000) return (yang / 1_000_000).toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " Mio Yang";
  if (yang >= 1_000) return (yang / 1_000).toLocaleString("de-DE", { maximumFractionDigits: 0 }) + "K Yang";
  return yang.toLocaleString("de-DE", { maximumFractionDigits: 0 }) + " Yang";
}

function PriceCell({ price, className = "" }: { price: number; className?: string }) {
  return (
    <div className={className}>
      <div className="font-mono">{formatWon(price)}</div>
      {price > 0 && <div className="font-mono text-xs text-gray-400">{formatYang(price)}</div>}
    </div>
  );
}

type TabType = "listings" | "priceHistory";

// ── Debounce hook ──

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ── URL param helpers ──

interface FilterState {
  tab: TabType;
  search: string;
  minPrice: string;
  maxPrice: string;
  serverId: number | undefined;
  sortBy: MarketSearchParams["sortBy"];
  sortOrder: "asc" | "desc";
  offset: number;
  attrName: string;
  attrMinValue: string;
}

function parseUrlParams(urlParams: URLSearchParams): FilterState {
  return {
    tab: (urlParams.get("tab") as TabType) || "listings",
    search: urlParams.get("search") || "",
    minPrice: urlParams.get("minPrice") || "",
    maxPrice: urlParams.get("maxPrice") || "",
    serverId: urlParams.get("serverId") ? parseInt(urlParams.get("serverId")!) : undefined,
    sortBy: (urlParams.get("sortBy") as MarketSearchParams["sortBy"]) || "price",
    sortOrder: (urlParams.get("sortOrder") as "asc" | "desc") || "desc",
    offset: urlParams.get("offset") ? parseInt(urlParams.get("offset")!) : 0,
    attrName: urlParams.get("attrName") || "",
    attrMinValue: urlParams.get("attrMinValue") || "",
  };
}

function buildUrlParams(state: FilterState): URLSearchParams {
  const p = new URLSearchParams();
  if (state.tab !== "listings") p.set("tab", state.tab);
  if (state.search) p.set("search", state.search);
  if (state.minPrice) p.set("minPrice", state.minPrice);
  if (state.maxPrice) p.set("maxPrice", state.maxPrice);
  if (state.serverId !== undefined) p.set("serverId", state.serverId.toString());
  if (state.sortBy && state.sortBy !== "price") p.set("sortBy", state.sortBy);
  if (state.sortOrder !== "desc") p.set("sortOrder", state.sortOrder);
  if (state.offset > 0) p.set("offset", state.offset.toString());
  if (state.attrName) p.set("attrName", state.attrName);
  if (state.attrMinValue) p.set("attrMinValue", state.attrMinValue);
  return p;
}

export default function Market() {
  const [urlParams, setUrlParams] = useRouterSearchParams();

  // Derive initial state from URL
  const urlState = useMemo(() => parseUrlParams(urlParams), [urlParams]);

  // Local input state
  const [searchInput, setSearchInput] = useState(urlState.search);
  const [minPrice, setMinPrice] = useState(urlState.minPrice);
  const [maxPrice, setMaxPrice] = useState(urlState.maxPrice);
  const [selectedServerId, setSelectedServerId] = useState<number | undefined>(urlState.serverId);
  const [attrNameInput, setAttrNameInput] = useState(urlState.attrName);
  const [attrMinValueInput, setAttrMinValueInput] = useState(urlState.attrMinValue);
  const [activeTab, setActiveTab] = useState<TabType>(urlState.tab);
  const [sortBy, setSortBy] = useState<MarketSearchParams["sortBy"]>(urlState.sortBy);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(urlState.sortOrder);

  // Debounce the filter inputs (500ms delay)
  const debouncedSearch = useDebounce(searchInput, 500);
  const debouncedMinPrice = useDebounce(minPrice, 500);
  const debouncedMaxPrice = useDebounce(maxPrice, 500);
  const debouncedAttrName = useDebounce(attrNameInput, 500);
  const debouncedAttrMinValue = useDebounce(attrMinValueInput, 500);

  // Sync debounced values → URL (triggers API call)
  useEffect(() => {
    const newState: FilterState = {
      tab: activeTab,
      search: debouncedSearch,
      minPrice: debouncedMinPrice,
      maxPrice: debouncedMaxPrice,
      serverId: selectedServerId,
      sortBy,
      sortOrder,
      offset: 0, // Reset to first page on filter change
      attrName: debouncedAttrName,
      attrMinValue: debouncedAttrMinValue,
    };
    setUrlParams(buildUrlParams(newState), { replace: true });
  }, [debouncedSearch, debouncedMinPrice, debouncedMaxPrice, selectedServerId, debouncedAttrName, debouncedAttrMinValue, activeTab, sortBy, sortOrder, setUrlParams]);

  // Build the API search params from URL state
  const searchParams: MarketSearchParams = useMemo(() => ({
    search: urlState.search || undefined,
    minPrice: urlState.minPrice ? parseFloat(urlState.minPrice) : undefined,
    maxPrice: urlState.maxPrice ? parseFloat(urlState.maxPrice) : undefined,
    serverId: urlState.serverId,
    attrName: urlState.attrName || undefined,
    attrMinValue: urlState.attrMinValue ? parseFloat(urlState.attrMinValue) : undefined,
    sortBy: urlState.sortBy,
    sortOrder: urlState.sortOrder,
    limit: 50,
    offset: urlState.offset,
  }), [urlState]);

  const { data: serversData } = useServers();

  const listingsQuery = useListings(urlState.tab === "listings" ? searchParams : {});
  const priceHistoryQuery = usePriceHistory(urlState.tab === "priceHistory" ? searchParams : {});

  const data = urlState.tab === "listings" ? listingsQuery.data : priceHistoryQuery.data;
  const isLoading = urlState.tab === "listings" ? listingsQuery.isLoading : priceHistoryQuery.isLoading;
  const error = urlState.tab === "listings" ? listingsQuery.error : priceHistoryQuery.error;

  // ── Autocomplete data ──

  // Item name suggestions (fetched dynamically as user types)
  const { data: nameSuggestions = [] } = useQuery({
    queryKey: ["suggestNames", debouncedSearch],
    queryFn: () => suggestItemNames(debouncedSearch),
    enabled: debouncedSearch.length >= 2 && isNaN(parseInt(debouncedSearch)),
    staleTime: 60 * 1000,
  });

  // Attribute names (loaded once, filtered locally)
  const { data: allAttrNames = [] } = useQuery({
    queryKey: ["attributeNames"],
    queryFn: getAttributeNames,
    staleTime: Infinity,
  });

  // Update URL directly for non-debounced actions
  const updateUrl = useCallback((updates: Partial<FilterState>) => {
    const currentState = parseUrlParams(urlParams);
    const newState = { ...currentState, ...updates };
    setUrlParams(buildUrlParams(newState), { replace: true });
  }, [urlParams, setUrlParams]);

  const handlePageChange = (newOffset: number) => {
    updateUrl({ offset: newOffset });
  };

  const handleSortChange = (newSortBy: MarketSearchParams["sortBy"], newSortOrder: "asc" | "desc") => {
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
    updateUrl({ sortBy: newSortBy, sortOrder: newSortOrder, offset: 0 });
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    updateUrl({ tab, offset: 0 });
  };

  const handleServerChange = (newServerId: number | undefined) => {
    setSelectedServerId(newServerId);
  };

  // Hover chart state
  const [hoveredItem, setHoveredItem] = useState<{
    vnum: number;
    serverId: number;
    name: string;
    position: { x: number; y: number };
  } | null>(null);

  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRowMouseEnter = useCallback((e: React.MouseEvent, item: any) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    hoverTimerRef.current = setTimeout(() => {
      setHoveredItem({
        vnum: item.vnum,
        serverId: item.serverId,
        name: item.name,
        position: { x: rect.right + 8, y: rect.top },
      });
    }, 400);
  }, []);

  const handleRowMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <DashboardNavbar />
        <div className="py-8">
          <div className="max-w-7xl mx-auto px-4">
            <h1 className="text-3xl font-bold mb-6">Metin2 Market</h1>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 mb-6">
              <button
                onClick={() => handleTabChange("listings")}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "listings"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                Live Listings
              </button>
              <button
                onClick={() => handleTabChange("priceHistory")}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "priceHistory"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                Price History
              </button>
            </div>

            {/* Search and Filters */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Server</label>
                  <select
                    value={selectedServerId || ""}
                    onChange={(e) => handleServerChange(e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">All Servers</option>
                    {serversData?.servers.map((server: any) => (
                      <option key={server.id} value={server.id}>
                        {server.name} {server.totalItems ? `(${server.totalItems})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <AutocompleteInput
                  label="Search (Name or VNUM)"
                  value={searchInput}
                  onChange={setSearchInput}
                  suggestions={nameSuggestions}
                  placeholder="Item name or VNUM..."
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Min Won</label>
                  <input
                    type="number"
                    step="any"
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                    placeholder="0"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Max Won</label>
                  <input
                    type="number"
                    step="any"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    placeholder="∞"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                {activeTab === "listings" && (
                  <>
                    <AutocompleteInput
                      label="Attribute Name"
                      value={attrNameInput}
                      onChange={setAttrNameInput}
                      suggestions={allAttrNames}
                      placeholder="e.g. krit, Verteidigung..."
                    />
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Attribute Min Value</label>
                      <input
                        type="number"
                        value={attrMinValueInput}
                        onChange={(e) => setAttrMinValueInput(e.target.value)}
                        placeholder="e.g. 10"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Loading */}
            {isLoading && (
              <div className="text-center py-12">
                <div className="text-lg text-gray-600">Loading market data...</div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
                <h2 className="text-xl font-semibold text-red-800 mb-2">Error</h2>
                <p className="text-red-600">{error instanceof Error ? error.message : "Failed to load market data"}</p>
              </div>
            )}

            {/* Results */}
            {data && (
              <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">
                    Results ({data.pagination.total} items)
                  </h2>
                  <div className="flex gap-2">
                    <select
                      value={sortBy}
                      onChange={(e) => handleSortChange(e.target.value as MarketSearchParams["sortBy"], sortOrder)}
                      className="px-3 py-1 border border-gray-300 rounded-lg"
                    >
                      <option value="price">Sort by Won</option>
                      <option value="vnum">Sort by VNUM</option>
                      <option value="name">Sort by Name</option>
                      {activeTab === "listings" && <option value="seller">Sort by Seller</option>}
                    </select>
                    <button
                      onClick={() => handleSortChange(sortBy, sortOrder === "asc" ? "desc" : "asc")}
                      className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      {sortOrder === "asc" ? "↑" : "↓"}
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  {activeTab === "listings" ? (
                    <ListingsTable items={(data as any).items} highlightAttr={urlState.attrName} />
                  ) : (
                    <PriceHistoryTable
                      items={(data as any).items}
                      onRowMouseEnter={handleRowMouseEnter}
                      onRowMouseLeave={handleRowMouseLeave}
                    />
                  )}
                </div>

                {/* Price History Chart Popup */}
                {hoveredItem && (
                  <PriceHistoryPopup
                    vnum={hoveredItem.vnum}
                    serverId={hoveredItem.serverId}
                    itemName={hoveredItem.name}
                    position={hoveredItem.position}
                    onClose={() => setHoveredItem(null)}
                  />
                )}

                {/* Pagination */}
                {data.pagination.total > 0 && (
                  <div className="mt-6 flex justify-between items-center">
                    <div className="text-sm text-gray-600">
                      Showing {data.pagination.offset + 1} to{" "}
                      {Math.min(data.pagination.offset + data.pagination.limit, data.pagination.total)}{" "}
                      of {data.pagination.total} items
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handlePageChange(Math.max(0, data.pagination.offset - data.pagination.limit))}
                        disabled={data.pagination.offset === 0}
                        className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => handlePageChange(data.pagination.offset + data.pagination.limit)}
                        disabled={!data.pagination.hasMore}
                        className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}

// ── Listings Table (full items with seller, attrs) ──

function ListingsTable({ items, highlightAttr }: { items: any[]; highlightAttr?: string }) {
  const lowerHighlight = highlightAttr?.toLowerCase();

  return (
    <table className="w-full">
      <thead className="bg-gray-100">
        <tr>
          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">VNUM</th>
          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Name</th>
          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Seller</th>
          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Price (Won)</th>
          <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Qty</th>
          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Server</th>
          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Attributes</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200">
        {items.length === 0 ? (
          <tr>
            <td colSpan={7} className="px-4 py-8 text-center text-gray-500">No items found.</td>
          </tr>
        ) : (
          items.map((item: any, idx: number) => (
            <tr key={`${item.id}-${item.serverId}-${idx}`} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm font-mono">{item.vnum}</td>
              <td className="px-4 py-3 text-sm">
                <div className="font-medium">{item.nameGerman || item.name}</div>
                {item.setGerman && <div className="text-xs text-gray-500">{item.setGerman}</div>}
              </td>
              <td className="px-4 py-3 text-sm">{item.seller}</td>
              <td className="px-4 py-3 text-sm text-right">
                <PriceCell price={item.price} />
              </td>
              <td className="px-4 py-3 text-sm text-center">{item.quantity}</td>
              <td className="px-4 py-3 text-sm text-gray-500">{item.serverName}</td>
              <td className="px-4 py-3 text-sm">
                {item.attrs && item.attrs.length > 0 ? (
                  <div className="text-xs space-y-0.5">
                    {item.attrs.map((attr: any, i: number) => {
                      const isMatch = lowerHighlight && attr.description.toLowerCase().includes(lowerHighlight);
                      return (
                        <div
                          key={i}
                          className={isMatch ? "text-blue-700 font-semibold" : "text-gray-600"}
                        >
                          {attr.description}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

// ── Price History Table (aggregated) ──

function PriceHistoryTable({
  items,
  onRowMouseEnter,
  onRowMouseLeave,
}: {
  items: any[];
  onRowMouseEnter: (e: React.MouseEvent, item: any) => void;
  onRowMouseLeave: () => void;
}) {
  return (
    <table className="w-full">
      <thead className="bg-gray-100">
        <tr>
          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">VNUM</th>
          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Name</th>
          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Avg Won</th>
          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Min Won</th>
          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Max Won</th>
          <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Listings</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200">
        {items.length === 0 ? (
          <tr>
            <td colSpan={6} className="px-4 py-8 text-center text-gray-500">No items found.</td>
          </tr>
        ) : (
          items.map((item: any) => (
            <tr
              key={`${item.vnum}-${item.serverId}`}
              className="hover:bg-blue-50 cursor-pointer transition-colors"
              onMouseEnter={(e) => onRowMouseEnter(e, item)}
              onMouseLeave={onRowMouseLeave}
            >
              <td className="px-4 py-3 text-sm font-mono">{item.vnum}</td>
              <td className="px-4 py-3 text-sm font-medium">{item.name}</td>
              <td className="px-4 py-3 text-sm text-right">
                <PriceCell price={item.avgPrice} />
              </td>
              <td className="px-4 py-3 text-sm text-right text-gray-500">
                <PriceCell price={item.minPrice} />
              </td>
              <td className="px-4 py-3 text-sm text-right text-gray-500">
                <PriceCell price={item.maxPrice} />
              </td>
              <td className="px-4 py-3 text-sm text-center">{item.totalListings}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
