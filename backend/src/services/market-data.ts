/**
 * Market Data Service
 * 
 * Reads the per-server JSON files from disk and provides
 * in-memory search/filter/sort/pagination over the full item listings.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SERVERS } from '../config/servers';
import { getItemLevel } from './translation';

const MARKET_JSON_DIR = path.resolve(__dirname, '../../data/market');

export interface StoredMarketItem {
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
  rand: number[];
  set: number;
  setGerman?: string;
  elem: number[];
  changelookvnum: number;
  petInfo: any | null;
}

interface ServerMarketData {
  serverId: number;
  serverName: string;
  fetchedAt: string;
  totalItems: number;
  items: StoredMarketItem[];
}

// In-memory cache: serverId -> data
const cache = new Map<number, ServerMarketData>();

/**
 * Load (or reload) market data for a specific server from JSON
 */
function loadServerData(serverId: number): ServerMarketData | null {
  const filePath = path.join(MARKET_JSON_DIR, `${serverId}.json`);
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data: ServerMarketData = JSON.parse(raw);
    cache.set(serverId, data);
    return data;
  } catch {
    console.error(`Failed to load market data for server ${serverId}`);
    return null;
  }
}

/**
 * Load all server data into cache
 */
export function loadAllServerData(): void {
  for (const server of SERVERS) {
    loadServerData(server.id);
  }
  console.log(`📦 Loaded market data for ${cache.size} servers into memory`);
}

/**
 * Get market data for a server (from cache or disk)
 */
function getServerData(serverId: number): ServerMarketData | null {
  if (cache.has(serverId)) return cache.get(serverId)!;
  return loadServerData(serverId);
}

/**
 * Refresh cache for a specific server (call after new fetch)
 */
export function refreshServerData(serverId: number): void {
  loadServerData(serverId);
}

export interface AttrFilter {
  name: string;
  minValue?: number | undefined;
}

export interface ListingSearchParams {
  search?: string | undefined;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  serverId?: number | undefined;
  category?: string | undefined;
  attrs?: AttrFilter[] | undefined;
  minLevel?: number | undefined;
  maxLevel?: number | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  sortBy?: 'price' | 'vnum' | 'name' | 'seller' | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

export interface ListingSearchResult {
  items: (StoredMarketItem & { serverId: number; serverName: string; fetchedAt: string })[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/**
 * Search through all loaded market data
 */
export function searchListings(params: ListingSearchParams): ListingSearchResult {
  const {
    search,
    minPrice,
    maxPrice,
    serverId,
    category,
    attrs,
    minLevel,
    maxLevel,
    limit = 50,
    offset = 0,
    sortBy = 'price',
    sortOrder = 'desc',
  } = params;

  // Collect items from relevant servers
  let allItems: (StoredMarketItem & { serverId: number; serverName: string; fetchedAt: string })[] = [];

  const serverIds = serverId ? [serverId] : SERVERS.map(s => s.id);

  for (const sid of serverIds) {
    const data = getServerData(sid);
    if (!data) continue;
    for (const item of data.items) {
      allItems.push({
        ...item,
        serverId: data.serverId,
        serverName: data.serverName,
        fetchedAt: data.fetchedAt,
      });
    }
  }

  // Filter
  if (search) {
    const lower = search.toLowerCase();
    const searchNum = parseInt(search);
    if (!isNaN(searchNum)) {
      allItems = allItems.filter(i => i.vnum === searchNum);
    } else {
      allItems = allItems.filter(
        i => i.nameGerman.toLowerCase().includes(lower) || i.name.toLowerCase().includes(lower)
      );
    }
  }

  if (minPrice !== undefined) allItems = allItems.filter(i => i.price >= minPrice);
  if (maxPrice !== undefined) allItems = allItems.filter(i => i.price <= maxPrice);
  if (category) allItems = allItems.filter(i => i.category === category);

  // Level filters (lookup from item_proto.json)
  if (minLevel !== undefined || maxLevel !== undefined) {
    allItems = allItems.filter(i => {
      const level = getItemLevel(i.vnum);
      if (level === null) return false; // Exclude items without level data
      if (minLevel !== undefined && level < minLevel) return false;
      if (maxLevel !== undefined && level > maxLevel) return false;
      return true;
    });
  }

  // Attribute filters (multiple, AND logic — item must match ALL filters)
  if (attrs && attrs.length > 0) {
    for (const af of attrs) {
      const lowerName = af.name.toLowerCase();
      allItems = allItems.filter(i =>
        i.attrs && i.attrs.some(a => {
          if (!a.description.toLowerCase().includes(lowerName)) return false;
          if (af.minValue !== undefined) return a.value >= af.minValue;
          return true;
        })
      );
    }
  }

  // Sort
  const dir = sortOrder === 'asc' ? 1 : -1;
  allItems.sort((a, b) => {
    switch (sortBy) {
      case 'vnum': return (a.vnum - b.vnum) * dir;
      case 'name': return a.nameGerman.localeCompare(b.nameGerman) * dir;
      case 'seller': return a.seller.localeCompare(b.seller) * dir;
      default: return (a.price - b.price) * dir; // 'price'
    }
  });

  const total = allItems.length;
  const limitNum = Math.min(limit, 500);
  const paged = allItems.slice(offset, offset + limitNum);

  return {
    items: paged,
    pagination: {
      total,
      limit: limitNum,
      offset,
      hasMore: offset + limitNum < total,
    },
  };
}

/**
 * Get info about loaded servers (which ones have data)
 */
export function getLoadedServers(): Array<{ serverId: number; serverName: string; fetchedAt: string; totalItems: number }> {
  const result: Array<{ serverId: number; serverName: string; fetchedAt: string; totalItems: number }> = [];
  for (const server of SERVERS) {
    const data = getServerData(server.id);
    if (data) {
      result.push({
        serverId: data.serverId,
        serverName: data.serverName,
        fetchedAt: data.fetchedAt,
        totalItems: data.totalItems,
      });
    }
  }
  return result;
}

// Load all data on import
loadAllServerData();
