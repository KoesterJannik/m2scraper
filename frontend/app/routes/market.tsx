import type { Route } from "./+types/market";
import { AuthGuard } from "../components/AuthGuard";
import { DashboardNavbar } from "../components/DashboardNavbar";
import { PriceHistoryPopup } from "../components/PriceHistoryPopup";
import { AutocompleteInput } from "../components/AutocompleteInput";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePriceHistory, useListings } from "../hooks/useMarketItems";
import { useServers } from "../hooks/useServers";
import { useSearchParams as useRouterSearchParams, useNavigate } from "react-router";
import type { MarketSearchParams, Bookmark, PriceAlert } from "../lib/api";
import {
  suggestItemNames,
  getAttributeNames,
  getBookmarks,
  addBookmark,
  removeBookmark,
  getAlerts,
  createAlert,
  deleteAlert,
  toggleAlert,
} from "../lib/api";

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

// ── Attribute filter helpers ──

interface AttrChip {
  name: string;
  value: string; // kept as string for the input; parsed to number when building API params
}

/** Serialize attr chips to URL-friendly string: "name1:val1|name2:val2" */
function serializeAttrs(chips: AttrChip[]): string {
  return chips
    .filter(c => c.name)
    .map(c => (c.value ? `${c.name}:${c.value}` : c.name))
    .join("|");
}

/** Deserialize URL attrs string back into chips */
function deserializeAttrs(raw: string): AttrChip[] {
  if (!raw) return [];
  return raw.split("|").filter(Boolean).map(part => {
    const idx = part.indexOf(":");
    if (idx === -1) return { name: part.trim(), value: "" };
    return { name: part.slice(0, idx).trim(), value: part.slice(idx + 1).trim() };
  });
}

// ── URL param helpers ──

interface FilterState {
  tab: TabType;
  search: string;
  minPrice: string;
  maxPrice: string;
  minLevel: string;
  maxLevel: string;
  serverId: number | undefined;
  sortBy: MarketSearchParams["sortBy"];
  sortOrder: "asc" | "desc";
  offset: number;
  attrs: string; // serialized attr chips
}

function parseUrlParams(urlParams: URLSearchParams): FilterState {
  return {
    tab: (urlParams.get("tab") as TabType) || "listings",
    search: urlParams.get("search") || "",
    minPrice: urlParams.get("minPrice") || "",
    maxPrice: urlParams.get("maxPrice") || "",
    minLevel: urlParams.get("minLevel") || "",
    maxLevel: urlParams.get("maxLevel") || "",
    serverId: urlParams.get("serverId") ? parseInt(urlParams.get("serverId")!) : undefined,
    sortBy: (urlParams.get("sortBy") as MarketSearchParams["sortBy"]) || "price",
    sortOrder: (urlParams.get("sortOrder") as "asc" | "desc") || "desc",
    offset: urlParams.get("offset") ? parseInt(urlParams.get("offset")!) : 0,
    attrs: urlParams.get("attrs") || "",
  };
}

function buildUrlParams(state: FilterState): URLSearchParams {
  const p = new URLSearchParams();
  if (state.tab !== "listings") p.set("tab", state.tab);
  if (state.search) p.set("search", state.search);
  if (state.minPrice) p.set("minPrice", state.minPrice);
  if (state.maxPrice) p.set("maxPrice", state.maxPrice);
  if (state.minLevel) p.set("minLevel", state.minLevel);
  if (state.maxLevel) p.set("maxLevel", state.maxLevel);
  if (state.serverId !== undefined) p.set("serverId", state.serverId.toString());
  if (state.sortBy && state.sortBy !== "price") p.set("sortBy", state.sortBy);
  if (state.sortOrder !== "desc") p.set("sortOrder", state.sortOrder);
  if (state.offset > 0) p.set("offset", state.offset.toString());
  if (state.attrs) p.set("attrs", state.attrs);
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
  const [minLevel, setMinLevel] = useState(urlState.minLevel);
  const [maxLevel, setMaxLevel] = useState(urlState.maxLevel);
  const [selectedServerId, setSelectedServerId] = useState<number | undefined>(urlState.serverId);
  const [activeTab, setActiveTab] = useState<TabType>(urlState.tab);
  const [sortBy, setSortBy] = useState<MarketSearchParams["sortBy"]>(urlState.sortBy);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(urlState.sortOrder);

  // Multi-attribute filter chips
  const [attrChips, setAttrChips] = useState<AttrChip[]>(deserializeAttrs(urlState.attrs));

  // Debounce the filter inputs (500ms delay)
  const debouncedSearch = useDebounce(searchInput, 500);
  const debouncedMinPrice = useDebounce(minPrice, 500);
  const debouncedMaxPrice = useDebounce(maxPrice, 500);
  const debouncedMinLevel = useDebounce(minLevel, 500);
  const debouncedMaxLevel = useDebounce(maxLevel, 500);
  const debouncedAttrs = useDebounce(serializeAttrs(attrChips), 500);

  // Sync debounced values → URL (triggers API call)
  useEffect(() => {
    const newState: FilterState = {
      tab: activeTab,
      search: debouncedSearch,
      minPrice: debouncedMinPrice,
      maxPrice: debouncedMaxPrice,
      minLevel: debouncedMinLevel,
      maxLevel: debouncedMaxLevel,
      serverId: selectedServerId,
      sortBy,
      sortOrder,
      offset: 0, // Reset to first page on filter change
      attrs: debouncedAttrs,
    };
    setUrlParams(buildUrlParams(newState), { replace: true });
  }, [debouncedSearch, debouncedMinPrice, debouncedMaxPrice, debouncedMinLevel, debouncedMaxLevel, selectedServerId, debouncedAttrs, activeTab, sortBy, sortOrder, setUrlParams]);

  // Build the API search params from URL state
  const searchParams: MarketSearchParams = useMemo(() => ({
    search: urlState.search || undefined,
    minPrice: urlState.minPrice ? parseFloat(urlState.minPrice) : undefined,
    maxPrice: urlState.maxPrice ? parseFloat(urlState.maxPrice) : undefined,
    minLevel: urlState.minLevel ? parseInt(urlState.minLevel) : undefined,
    maxLevel: urlState.maxLevel ? parseInt(urlState.maxLevel) : undefined,
    serverId: urlState.serverId,
    attrs: urlState.attrs || undefined,
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

  // ── Bookmarks ──
  const queryClient = useQueryClient();

  const { data: bookmarks = [] } = useQuery({
    queryKey: ["bookmarks"],
    queryFn: getBookmarks,
    staleTime: 30_000,
  });

  const addBookmarkMut = useMutation({
    mutationFn: addBookmark,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bookmarks"] }),
  });

  const removeBookmarkMut = useMutation({
    mutationFn: removeBookmark,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bookmarks"] }),
  });

  const isBookmarked = useCallback((vnum: number, seller: string) => {
    return bookmarks.some(b => b.vnum === vnum && b.sellerName === seller);
  }, [bookmarks]);

  const handleToggleBookmark = useCallback((item: any) => {
    const existing = bookmarks.find(b => b.vnum === item.vnum && b.sellerName === item.seller);
    if (existing) {
      removeBookmarkMut.mutate(existing.id);
    } else {
      addBookmarkMut.mutate({
        vnum: item.vnum,
        sellerName: item.seller,
        itemName: item.nameGerman || item.name,
        serverId: item.serverId,
      });
    }
  }, [bookmarks, addBookmarkMut, removeBookmarkMut]);

  const handleBookmarkClick = useCallback((bm: Bookmark) => {
    setSearchInput(bm.vnum.toString());
    setActiveTab("listings");
  }, []);

  // ── Alerts ──

  const { data: alerts = [] } = useQuery({
    queryKey: ["alerts"],
    queryFn: getAlerts,
    staleTime: 30_000,
  });

  const createAlertMut = useMutation({
    mutationFn: createAlert,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alerts"] }),
  });

  const deleteAlertMut = useMutation({
    mutationFn: deleteAlert,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alerts"] }),
  });

  const toggleAlertMut = useMutation({
    mutationFn: toggleAlert,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alerts"] }),
  });

  // Alert form state
  const [alertForm, setAlertForm] = useState<{
    open: boolean;
    vnum: number;
    serverId: number;
    itemName: string;
    serverName: string;
    priceThreshold: string;
    direction: "above" | "below";
  }>({ open: false, vnum: 0, serverId: 0, itemName: "", serverName: "", priceThreshold: "", direction: "below" });

  const openAlertForm = useCallback((item: any) => {
    setAlertForm({
      open: true,
      vnum: item.vnum,
      serverId: item.serverId,
      itemName: item.nameGerman || item.name,
      serverName: item.serverName || "",
      priceThreshold: "",
      direction: "below",
    });
  }, []);

  const submitAlert = useCallback(() => {
    if (!alertForm.priceThreshold || !alertForm.serverId) return;
    // Convert comma to dot for parsing (German locale support)
    const normalizedValue = alertForm.priceThreshold.replace(/,/g, '.');
    const threshold = parseFloat(normalizedValue);
    // Allow any positive number, including very small decimals like 0.0170
    if (isNaN(threshold) || threshold < 0) {
      return; // Invalid input
    }
    createAlertMut.mutate({
      vnum: alertForm.vnum,
      serverId: alertForm.serverId,
      itemName: alertForm.itemName,
      priceThreshold: threshold,
      direction: alertForm.direction,
    });
    setAlertForm({ open: false, vnum: 0, serverId: 0, itemName: "", serverName: "", priceThreshold: "", direction: "below" });
  }, [alertForm, createAlertMut]);

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
          <div className="max-w-[1600px] mx-auto px-4 flex gap-6">
            {/* ── Main content ── */}
            <div className="flex-1 min-w-0">
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
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Min Level</label>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={minLevel}
                          onChange={(e) => setMinLevel(e.target.value)}
                          placeholder="0"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Max Level</label>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={maxLevel}
                          onChange={(e) => setMaxLevel(e.target.value)}
                          placeholder="∞"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    </>
                  )}
                  {activeTab === "listings" && (
                    <div className="lg:col-span-3">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Attribute Filters</label>
                      <AttributeFilterChips
                        chips={attrChips}
                        onChange={setAttrChips}
                        allAttrNames={allAttrNames}
                      />
                    </div>
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
                      <ListingsTable
                        items={(data as any).items}
                        highlightAttrs={deserializeAttrs(urlState.attrs).map(a => a.name)}
                        isBookmarked={isBookmarked}
                        onToggleBookmark={handleToggleBookmark}
                        onCreateAlert={openAlertForm}
                        onItemClick={(item) => {
                          // Switch to price history tab and filter by this item
                          setSearchInput(item.vnum.toString());
                          setActiveTab("priceHistory");
                          setSelectedServerId(item.serverId);
                          updateUrl({ tab: "priceHistory", search: item.vnum.toString(), serverId: item.serverId, offset: 0 });
                        }}
                      />
                    ) : (
                      <PriceHistoryTable
                        items={(data as any).items}
                        onRowMouseEnter={handleRowMouseEnter}
                        onRowMouseLeave={handleRowMouseLeave}
                        onCreateAlert={openAlertForm}
                        serversData={serversData}
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

            {/* ── Right Sidebar: Bookmarks & Alerts ── */}
            <div className="hidden lg:block w-80 flex-shrink-0 space-y-6">
              {/* Bookmarks */}
              <div className="bg-white rounded-lg shadow-md p-4">
                <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
                  </svg>
                  Bookmarks ({bookmarks.length})
                </h3>
                {bookmarks.length === 0 ? (
                  <p className="text-sm text-gray-400">No bookmarks yet. Click the bookmark icon on a listing to save it.</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {bookmarks.map((bm) => (
                      <div
                        key={bm.id}
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 cursor-pointer group"
                        onClick={() => handleBookmarkClick(bm)}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">{bm.itemName}</div>
                          <div className="text-xs text-gray-500">Seller: {bm.sellerName}</div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeBookmarkMut.mutate(bm.id);
                          }}
                          className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Remove bookmark"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Alerts */}
              <div className="bg-white rounded-lg shadow-md p-4">
                <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  Price Alerts ({alerts.length})
                </h3>
                {alerts.length === 0 ? (
                  <p className="text-sm text-gray-400">No alerts yet. Click the bell icon on a listing to create one.</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {alerts.map((al) => (
                      <div key={al.id} className="p-2 rounded-lg border border-gray-100 group">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium text-gray-900 truncate">{al.itemName}</div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => toggleAlertMut.mutate(al.id)}
                              className={`p-1 rounded transition-colors ${al.active ? "text-green-600 hover:text-green-800" : "text-gray-400 hover:text-gray-600"}`}
                              title={al.active ? "Active — click to pause" : "Paused — click to activate"}
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                {al.active ? (
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                ) : (
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                                )}
                              </svg>
                            </button>
                            <button
                              onClick={() => deleteAlertMut.mutate(al.id)}
                              className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Delete alert"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {al.direction === "below" ? "≤" : "≥"} {al.priceThreshold.toLocaleString("de-DE", { maximumFractionDigits: 4 })} Won
                          {!al.active && <span className="ml-1 text-yellow-600">(paused)</span>}
                        </div>
                        <div className="text-xs text-gray-400">
                          {serversData?.servers.find((s: any) => s.id === al.serverId)?.name || `Server ${al.serverId}`}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Alert creation modal */}
        {alertForm.open && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setAlertForm(f => ({ ...f, open: false }))}>
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-4">Create Price Alert</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Item</label>
                  <div className="text-sm text-gray-900 font-medium">{alertForm.itemName} (VNUM {alertForm.vnum})</div>
                  {alertForm.serverName && (
                    <div className="text-xs text-gray-500 mt-0.5">Server: {alertForm.serverName}</div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Alert when price...</label>
                  <select
                    value={alertForm.direction}
                    onChange={(e) => setAlertForm(f => ({ ...f, direction: e.target.value as "above" | "below" }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="below">Drops below or equals</option>
                    <option value="above">Rises above or equals</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price threshold (Won)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={alertForm.priceThreshold}
                    onChange={(e) => {
                      let val = e.target.value;
                      // Replace comma with dot for internal processing (German locale support)
                      val = val.replace(/,/g, '.');
                      // Allow empty, or valid decimal number (including very small values like 0.0170)
                      // Allow digits, single dot, and leading zero
                      if (val === "" || /^\d*\.?\d*$/.test(val)) {
                        setAlertForm(f => ({ ...f, priceThreshold: val }));
                      }
                    }}
                    placeholder="e.g. 0,0170 or 0.5"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                  <p className="text-xs text-gray-500 mt-1">You can use comma (,) or dot (.) as decimal separator. Example: 0,0170 or 0.0170</p>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => setAlertForm(f => ({ ...f, open: false }))}
                    className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitAlert}
                    disabled={(() => {
                      if (!alertForm.priceThreshold) return true;
                      // Convert comma to dot for validation (German locale support)
                      const normalizedValue = alertForm.priceThreshold.replace(/,/g, '.');
                      const num = parseFloat(normalizedValue);
                      return isNaN(num) || num < 0;
                    })()}
                    className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Create Alert
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}

// ── Attribute Filter Chips ──

function AttributeFilterChips({
  chips,
  onChange,
  allAttrNames,
}: {
  chips: AttrChip[];
  onChange: (chips: AttrChip[]) => void;
  allAttrNames: string[];
}) {
  const valueInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  const [newAttrInput, setNewAttrInput] = useState("");

  const handleAddAttr = (name: string) => {
    if (!name.trim()) return;
    // Don't add duplicate
    if (chips.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      setNewAttrInput("");
      return;
    }
    const newChips = [...chips, { name: name.trim(), value: "" }];
    onChange(newChips);
    setNewAttrInput("");
    // Focus the new value input after render
    const newIdx = newChips.length - 1;
    requestAnimationFrame(() => {
      valueInputRefs.current.get(newIdx)?.focus();
    });
  };

  const handleRemoveChip = (index: number) => {
    const newChips = chips.filter((_, i) => i !== index);
    onChange(newChips);
  };

  const handleValueChange = (index: number, value: string) => {
    const newChips = [...chips];
    newChips[index] = { ...newChips[index], value };
    onChange(newChips);
  };

  const handleClearAll = () => {
    onChange([]);
    setNewAttrInput("");
  };

  return (
    <div className="space-y-2">
      {/* Existing chips */}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip, idx) => (
            <div
              key={`${chip.name}-${idx}`}
              className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg pl-3 pr-1 py-1"
            >
              <span className="text-sm font-medium text-blue-800">{chip.name}</span>
              <span className="text-gray-400">≥</span>
              <input
                ref={(el) => { if (el) valueInputRefs.current.set(idx, el); else valueInputRefs.current.delete(idx); }}
                type="number"
                value={chip.value}
                onChange={(e) => handleValueChange(idx, e.target.value)}
                placeholder="min"
                className="w-16 px-1.5 py-0.5 text-sm border border-blue-200 rounded focus:ring-1 focus:ring-blue-400 focus:border-transparent bg-white"
              />
              <button
                onClick={() => handleRemoveChip(idx)}
                className="p-0.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                title="Remove filter"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
          <button
            onClick={handleClearAll}
            className="text-xs text-gray-500 hover:text-red-600 self-center ml-1 underline"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Add new attribute */}
      <AutocompleteInput
        label=""
        value={newAttrInput}
        onChange={setNewAttrInput}
        onSelect={handleAddAttr}
        suggestions={allAttrNames}
        placeholder="+ Add attribute filter..."
      />
    </div>
  );
}

// ── Listings Table (full items with seller, attrs) ──

function ListingsTable({
  items,
  highlightAttrs = [],
  isBookmarked,
  onToggleBookmark,
  onCreateAlert,
  onItemClick,
}: {
  items: any[];
  highlightAttrs?: string[];
  isBookmarked: (vnum: number, seller: string) => boolean;
  onToggleBookmark: (item: any) => void;
  onCreateAlert: (item: any) => void;
  onItemClick: (item: any) => void;
}) {
  const lowerHighlights = highlightAttrs.map(h => h.toLowerCase()).filter(Boolean);

  return (
    <table className="w-full">
      <thead className="bg-gray-100">
        <tr>
          <th className="px-2 py-3 text-center text-sm font-semibold text-gray-700 w-20"></th>
          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">VNUM</th>
          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Name</th>
          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Seller</th>
          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Price (Won)</th>
          <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Qty / Price per Item</th>
          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Total Price</th>
          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Server</th>
          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Attributes</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200">
        {items.length === 0 ? (
          <tr>
            <td colSpan={9} className="px-4 py-8 text-center text-gray-500">No items found.</td>
          </tr>
        ) : (
          items.map((item: any, idx: number) => {
            const bookmarked = isBookmarked(item.vnum, item.seller);
            return (
              <tr 
                key={`${item.id}-${item.serverId}-${idx}`} 
                className="hover:bg-gray-50 group cursor-pointer"
                onClick={() => onItemClick(item)}
              >
                <td className="px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => onToggleBookmark(item)}
                      className={`p-1 rounded transition-colors ${
                        bookmarked
                          ? "text-yellow-500 hover:text-yellow-600"
                          : "text-gray-300 hover:text-yellow-500"
                      }`}
                      title={bookmarked ? "Remove bookmark" : "Bookmark"}
                    >
                      <svg className="w-4 h-4" fill={bookmarked ? "currentColor" : "none"} viewBox="0 0 20 20" stroke="currentColor" strokeWidth={bookmarked ? 0 : 1.5}>
                        <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => onCreateAlert(item)}
                      className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors"
                      title="Set price alert"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm font-mono">{item.vnum}</td>
                <td className="px-4 py-3 text-sm">
                  <div className="font-medium">{item.nameGerman || item.name}</div>
                  {item.setGerman && <div className="text-xs text-gray-500">{item.setGerman}</div>}
                </td>
                <td className="px-4 py-3 text-sm">{item.seller}</td>
                <td className="px-4 py-3 text-sm text-right">
                  <PriceCell price={item.price} />
                </td>
                <td className="px-4 py-3 text-sm text-center">
                  <div className="font-medium">{item.quantity}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    <PriceCell price={item.price} className="text-xs" />
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-right">
                  <PriceCell price={item.price * item.quantity} />
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{item.serverName}</td>
                <td className="px-4 py-3 text-sm">
                  {item.attrs && item.attrs.length > 0 ? (
                    <div className="text-xs space-y-0.5">
                      {item.attrs.map((attr: any, i: number) => {
                        const descLower = attr.description.toLowerCase();
                        const isMatch = lowerHighlights.some(h => descLower.includes(h));
                        const displayDesc = attr.description.replace(/%%/g, '%');
                        return (
                          <div
                            key={i}
                            className={isMatch ? "text-blue-700 font-semibold" : "text-gray-600"}
                          >
                            {displayDesc}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}

// ── Price Change Badge ──

function PriceChangeBadge({ value, label }: { value: number | null; label: string }) {
  if (value === null || value === undefined) {
    return (
      <div className="text-center">
        <div className="text-xs text-gray-400 mb-0.5">{label}</div>
        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-400">
          —
        </span>
      </div>
    );
  }

  const isPositive = value > 0;
  const isNeutral = value === 0;
  const arrow = isPositive ? "↑" : isNeutral ? "→" : "↓";
  const formattedValue = `${isPositive ? "+" : ""}${value.toFixed(1)}%`;

  let bgColor: string;
  let textColor: string;
  if (isNeutral) {
    bgColor = "bg-gray-100";
    textColor = "text-gray-600";
  } else if (isPositive) {
    // Price went up → red for buyers (bad), but using standard market colors
    bgColor = value > 10 ? "bg-red-100" : "bg-red-50";
    textColor = value > 10 ? "text-red-700" : "text-red-600";
  } else {
    // Price went down → green for buyers (good deal)
    bgColor = value < -10 ? "bg-green-100" : "bg-green-50";
    textColor = value < -10 ? "text-green-700" : "text-green-600";
  }

  return (
    <div className="text-center">
      <div className="text-xs text-gray-400 mb-0.5">{label}</div>
      <span
        className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${bgColor} ${textColor}`}
        title={`${label}: ${formattedValue}`}
      >
        {arrow} {formattedValue}
      </span>
    </div>
  );
}

// ── Price History Table (aggregated) ──

function PriceHistoryTable({
  items,
  onRowMouseEnter,
  onRowMouseLeave,
  onCreateAlert,
  serversData,
}: {
  items: any[];
  onRowMouseEnter: (e: React.MouseEvent, item: any) => void;
  onRowMouseLeave: () => void;
  onCreateAlert: (item: any) => void;
  serversData?: { servers: any[] };
}) {
  return (
    <table className="w-full">
      <thead className="bg-gray-100">
        <tr>
          <th className="px-2 py-3 text-center text-sm font-semibold text-gray-700 w-20"></th>
          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">VNUM</th>
          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Name</th>
          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Avg Won</th>
          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Min Won</th>
          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Max Won</th>
          <th className="px-2 py-3 text-center text-sm font-semibold text-gray-700">24h</th>
          <th className="px-2 py-3 text-center text-sm font-semibold text-gray-700">7d</th>
          <th className="px-2 py-3 text-center text-sm font-semibold text-gray-700">30d</th>
          <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Listings</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200">
        {items.length === 0 ? (
          <tr>
            <td colSpan={10} className="px-4 py-8 text-center text-gray-500">No items found.</td>
          </tr>
        ) : (
          items.map((item: any) => {
            const serverName = serversData?.servers.find((s: any) => s.id === item.serverId)?.name || `Server ${item.serverId}`;
            return (
              <tr
                key={`${item.vnum}-${item.serverId}`}
                className="hover:bg-blue-50 transition-colors"
                onMouseEnter={(e) => onRowMouseEnter(e, item)}
                onMouseLeave={onRowMouseLeave}
              >
                <td className="px-2 py-3 text-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateAlert({
                        ...item,
                        serverName,
                        nameGerman: item.name,
                      });
                    }}
                    className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors"
                    title="Set price alert"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                  </button>
                </td>
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
                <td className="px-2 py-3">
                  <PriceChangeBadge value={item.change24h} label="24h" />
                </td>
                <td className="px-2 py-3">
                  <PriceChangeBadge value={item.change7d} label="7d" />
                </td>
                <td className="px-2 py-3">
                  <PriceChangeBadge value={item.change30d} label="30d" />
                </td>
                <td className="px-4 py-3 text-sm text-center">{item.totalListings}</td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
