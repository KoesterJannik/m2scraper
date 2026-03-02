import type { Route } from "./+types/market";
import { AuthGuard } from "../components/AuthGuard";
import { DashboardNavbar } from "../components/DashboardNavbar";
import { PriceHistoryPopup } from "../components/PriceHistoryPopup";
import { useState, useEffect, useCallback, useRef } from "react";
import { usePriceHistory, useListings } from "../hooks/useMarketItems";
import { useServers } from "../hooks/useServers";
import type { MarketSearchParams } from "../lib/api";

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

export default function Market() {
  const [activeTab, setActiveTab] = useState<TabType>("listings");
  const [searchParams, setSearchParams] = useState<MarketSearchParams>({
    limit: 50,
    offset: 0,
    sortBy: "price",
    sortOrder: "desc",
  });

  const [searchInput, setSearchInput] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [selectedServerId, setSelectedServerId] = useState<number | undefined>(undefined);

  const { data: serversData } = useServers();

  const listingsQuery = useListings(activeTab === "listings" ? searchParams : {});
  const priceHistoryQuery = usePriceHistory(activeTab === "priceHistory" ? searchParams : {});

  const data = activeTab === "listings" ? listingsQuery.data : priceHistoryQuery.data;
  const isLoading = activeTab === "listings" ? listingsQuery.isLoading : priceHistoryQuery.isLoading;
  const error = activeTab === "listings" ? listingsQuery.error : priceHistoryQuery.error;

  useEffect(() => {
    setSearchParams(prev => ({ ...prev, serverId: selectedServerId, offset: 0 }));
  }, [selectedServerId]);

  const handleSearch = () => {
    setSearchParams({
      ...searchParams,
      search: searchInput || undefined,
      minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      serverId: selectedServerId,
      offset: 0,
    });
  };

  const handlePageChange = (newOffset: number) => {
    setSearchParams({ ...searchParams, offset: newOffset });
  };

  const handleSortChange = (sortBy: MarketSearchParams["sortBy"], sortOrder: "asc" | "desc") => {
    setSearchParams({ ...searchParams, sortBy, sortOrder, offset: 0 });
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setSearchParams(prev => ({ ...prev, offset: 0 }));
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
    }, 400); // 400ms delay to avoid flickering
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Server</label>
                  <select
                    value={selectedServerId || ""}
                    onChange={(e) => setSelectedServerId(e.target.value ? parseInt(e.target.value) : undefined)}
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Search (Name or VNUM)</label>
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="Item name or VNUM..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
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
              </div>
              <button
                onClick={handleSearch}
                className="w-full md:w-auto px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Search
              </button>
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
                      value={searchParams.sortBy}
                      onChange={(e) => handleSortChange(e.target.value as MarketSearchParams["sortBy"], searchParams.sortOrder || "desc")}
                      className="px-3 py-1 border border-gray-300 rounded-lg"
                    >
                      <option value="price">Sort by Won</option>
                      <option value="vnum">Sort by VNUM</option>
                      <option value="name">Sort by Name</option>
                      {activeTab === "listings" && <option value="seller">Sort by Seller</option>}
                    </select>
                    <button
                      onClick={() => handleSortChange(searchParams.sortBy || "price", searchParams.sortOrder === "asc" ? "desc" : "asc")}
                      className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      {searchParams.sortOrder === "asc" ? "↑" : "↓"}
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  {activeTab === "listings" ? (
                    <ListingsTable items={(data as any).items} />
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

function ListingsTable({ items }: { items: any[] }) {
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
                  <div className="text-xs text-gray-600">
                    {item.attrs.slice(0, 2).map((attr: any, i: number) => (
                      <div key={i}>{attr.description}</div>
                    ))}
                    {item.attrs.length > 2 && (
                      <div className="text-gray-400">+{item.attrs.length - 2} more</div>
                    )}
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
