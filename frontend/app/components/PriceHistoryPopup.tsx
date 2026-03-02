import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPriceHistory } from "../lib/api";
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";

interface PriceHistoryPopupProps {
  vnum: number;
  serverId: number;
  itemName: string;
  position: { x: number; y: number };
  onClose: () => void;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
  });
}

const YANG_PER_WON = 100_000_000;

function formatWonShort(value: number): string {
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K Won`;
  if (value >= 1) return `${value.toFixed(2)} Won`;
  if (value > 0) return `${value.toFixed(4)} Won`;
  return "0";
}

function formatYangShort(wonValue: number): string {
  const yang = wonValue * YANG_PER_WON;
  if (yang >= 1_000_000_000) return `${(yang / 1_000_000_000).toFixed(1)} Mrd Yang`;
  if (yang >= 1_000_000) return `${(yang / 1_000_000).toFixed(1)} Mio Yang`;
  if (yang >= 1_000) return `${(yang / 1_000).toFixed(1)}K Yang`;
  return `${yang.toFixed(0)} Yang`;
}

function formatPriceShort(value: number): string {
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  if (value >= 1) return value.toFixed(2);
  if (value > 0) return value.toFixed(4);
  return "0";
}

export function PriceHistoryPopup({ vnum, serverId, itemName, position, onClose }: PriceHistoryPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["priceHistoryChart", vnum, serverId],
    queryFn: () => getPriceHistory(vnum, serverId),
    staleTime: 60 * 1000,
  });

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Prepare chart data
  const chartData = data?.history?.map((entry: any) => ({
    date: formatShortDate(entry.fetchedAt),
    fullDate: formatDate(entry.fetchedAt),
    avgPrice: entry.avgPrice,
    minPrice: entry.minPrice,
    maxPrice: entry.maxPrice,
    listings: entry.totalListings,
  })) || [];

  const hasData = chartData.some((d: any) => d.avgPrice > 0);

  // Position the popup: try to keep it in viewport
  const popupStyle: React.CSSProperties = {
    position: "fixed",
    zIndex: 9999,
    left: Math.min(position.x, window.innerWidth - 520),
    top: Math.min(position.y - 10, window.innerHeight - 420),
  };

  return (
    <div style={popupStyle} ref={popupRef}>
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-[500px] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 flex justify-between items-center">
          <div>
            <h3 className="text-white font-semibold text-sm truncate max-w-[350px]">
              {data?.name || itemName}
            </h3>
            <span className="text-blue-200 text-xs">VNUM: {vnum}</span>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {isLoading && (
            <div className="flex items-center justify-center h-48">
              <div className="text-gray-500 text-sm">Loading price history...</div>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-48">
              <div className="text-red-500 text-sm">Failed to load price history</div>
            </div>
          )}

          {data && chartData.length === 0 && (
            <div className="flex items-center justify-center h-48">
              <div className="text-gray-400 text-sm">No price history available yet</div>
            </div>
          )}

          {data && chartData.length > 0 && hasData && (
            <>
              {/* Chart */}
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="wonGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    tickLine={false}
                    axisLine={{ stroke: "#e5e7eb" }}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    tickFormatter={formatPriceShort}
                    tickLine={false}
                    axisLine={{ stroke: "#e5e7eb" }}
                    width={55}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1f2937",
                      border: "none",
                      borderRadius: "8px",
                      fontSize: "12px",
                      color: "#f9fafb",
                    }}
                    labelStyle={{ color: "#9ca3af", marginBottom: "4px" }}
                    labelFormatter={(label, payload) => {
                      if (payload && payload.length > 0) {
                        return payload[0]?.payload?.fullDate || label;
                      }
                      return label;
                    }}
                    formatter={(value: number, name: string) => [
                      `${value.toLocaleString("de-DE", { maximumFractionDigits: 4 })} Won (${formatYangShort(value)})`,
                      name,
                    ]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "11px" }}
                    iconSize={8}
                  />

                  <Area
                    type="monotone"
                    dataKey="avgPrice"
                    name="Avg Won"
                    stroke="#10b981"
                    fill="url(#wonGradient)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: "#10b981" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="minPrice"
                    name="Min Won"
                    stroke="#34d399"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="maxPrice"
                    name="Max Won"
                    stroke="#059669"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>

              {/* Stats row */}
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="bg-gray-50 rounded-lg p-2 text-center">
                  <div className="text-xs text-gray-500">Data Points</div>
                  <div className="text-sm font-semibold text-gray-800">{chartData.length}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-2 text-center">
                  <div className="text-xs text-gray-500">Latest Listings</div>
                  <div className="text-sm font-semibold text-gray-800">
                    {chartData[chartData.length - 1]?.listings || 0}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-2 text-center">
                  <div className="text-xs text-gray-500">Latest Price</div>
                  <div className="text-sm font-semibold text-gray-800">
                    {formatWonShort(chartData[chartData.length - 1]?.avgPrice || 0)}
                  </div>
                  <div className="text-xs text-gray-400">
                    {formatYangShort(chartData[chartData.length - 1]?.avgPrice || 0)}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
