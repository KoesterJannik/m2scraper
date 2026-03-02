/**
 * Fetch and Store Market Data
 * 
 * This script:
 * 1. Fetches market data from the API for each server
 * 2. Translates items to German
 * 3. Saves the full translated item list as JSON per server (for live search)
 * 4. Calculates min/max/avg prices per item (vnum) and stores in DB (for history)
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { db } from '../db';
import { marketServer, marketItemPriceHistory } from '../db/schema';
import { SERVERS, type ServerConfig } from '../config/servers';

// Load translation data
const dataDir = path.resolve(__dirname, '../../data');

interface ItemNames { [vnum: string]: string; }
interface ItemDescriptions { [vnum: string]: string; }
interface StatMap { [statId: string]: string; }
interface SiteLang { sets?: { [key: string]: string }; [key: string]: any; }

const itemNames: ItemNames = JSON.parse(fs.readFileSync(path.join(dataDir, 'item_names.json'), 'utf-8'));
const itemDescriptions: ItemDescriptions = JSON.parse(fs.readFileSync(path.join(dataDir, 'item_desc.json'), 'utf-8'));
const statMap: StatMap = JSON.parse(fs.readFileSync(path.join(dataDir, 'stat_map.json'), 'utf-8'));
const siteLang: SiteLang = JSON.parse(fs.readFileSync(path.join(dataDir, 'site_lang.json'), 'utf-8'));

interface RawMarketItem {
  id: number;
  vnum: number;
  name: string;
  seller: string;
  yangPrice: number;
  wonPrice: number;
  quantity: number;
  category: string;
  job: number;
  attrs: number[][];
  sockets: number[];
  rand: number[];
  set: number;
  elem: number[];
  changelookvnum: number;
  petInfo: any | null;
}

export interface TranslatedMarketItem {
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

const YANG_PER_WON = 100_000_000; // 1 Won = 100 million Yang

/**
 * Convert raw item prices to a single unit price in Won.
 * If wonPrice > 0 use it, otherwise convert yangPrice.
 * Always divide by quantity to get the per-item price.
 */
function toUnitPriceWon(item: RawMarketItem): number {
  const qty = Math.max(item.quantity, 1); // avoid division by zero
  if (item.wonPrice > 0) {
    return item.wonPrice / qty;
  }
  if (item.yangPrice > 0) {
    return item.yangPrice / YANG_PER_WON / qty;
  }
  return 0;
}

const METIN2_MARKET_BASE_URL = 'https://metin2alerts.com/store/public/data';
const MARKET_JSON_DIR = path.join(dataDir, 'market');

// Ensure market JSON directory exists
if (!fs.existsSync(MARKET_JSON_DIR)) {
  fs.mkdirSync(MARKET_JSON_DIR, { recursive: true });
}

/**
 * Translate attributes to German
 */
function translateAttributes(attrs: number[][]): Array<{ statId: number; value: number; description: string }> {
  return attrs
    .filter((attr) => attr.length >= 2 && attr[0] !== undefined && attr[1] !== undefined)
    .map(([statId, value]) => {
      const sid = statId as number;
      const val = value as number;
      const desc = (statMap[sid.toString()] || `Unbekannt (${sid})`).replace(/%d/g, val.toString());
      return { statId: sid, value: val, description: desc };
    });
}

/**
 * Translate a single item
 */
function translateItem(item: RawMarketItem): TranslatedMarketItem {
  const vnumStr = item.vnum.toString();
  const result: TranslatedMarketItem = {
    id: item.id,
    vnum: item.vnum,
    name: item.name,
    nameGerman: itemNames[vnumStr] || item.name,
    description: itemDescriptions[vnumStr] || '',
    seller: item.seller,
    price: toUnitPriceWon(item),
    quantity: item.quantity,
    category: item.category,
    job: item.job,
    attrs: translateAttributes(item.attrs),
    sockets: item.sockets,
    rand: item.rand,
    set: item.set,
    elem: item.elem,
    changelookvnum: item.changelookvnum,
    petInfo: item.petInfo,
  };
  if (item.set > 0 && siteLang.sets) {
    const setName = siteLang.sets[item.set.toString()];
    if (setName) result.setGerman = setName;
  }
  return result;
}

/**
 * Fetch market data for a specific server
 */
async function fetchMarketDataForServer(serverConfig: ServerConfig): Promise<RawMarketItem[]> {
  try {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 100000);
    const apiUrl = `${METIN2_MARKET_BASE_URL}/${serverConfig.id}.json?v=${timestamp}&r=${random}`;
    
    console.log(`📡 Fetching market data from ${serverConfig.name} (ID: ${serverConfig.id})...`);
    
    const response = await axios.get(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      timeout: 15000,
    });

    const rawItems: RawMarketItem[] = Array.isArray(response.data) ? response.data : [];
    console.log(`✅ Found ${rawItems.length} items from ${serverConfig.name}`);
    return rawItems;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(`❌ Error fetching ${serverConfig.name} market data:`, error.message);
    } else {
      console.error(`❌ Unexpected error:`, error);
    }
    return [];
  }
}

/**
 * Save full translated item list as JSON for a server
 */
function saveItemsAsJson(serverConfig: ServerConfig, items: TranslatedMarketItem[]): void {
  const filePath = path.join(MARKET_JSON_DIR, `${serverConfig.id}.json`);
  const data = {
    serverId: serverConfig.id,
    serverName: serverConfig.name,
    fetchedAt: new Date().toISOString(),
    totalItems: items.length,
    items,
  };
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8');
  console.log(`💾 Saved ${items.length} items to ${filePath}`);
}

/**
 * Aggregate prices per vnum and store in DB
 */
async function storePriceHistory(serverConfig: ServerConfig, items: RawMarketItem[]): Promise<void> {
  const fetchedAt = new Date();

  // Upsert server
  await db
    .insert(marketServer)
    .values({ id: serverConfig.id, name: serverConfig.name, lastFetchedAt: fetchedAt })
    .onConflictDoUpdate({
      target: marketServer.id,
      set: { name: serverConfig.name, lastFetchedAt: fetchedAt, updatedAt: new Date() },
    });

  // Group by vnum — convert each listing to unit price in Won first
  const grouped = new Map<number, { prices: number[]; totalQty: number; count: number }>();
  for (const item of items) {
    if (!grouped.has(item.vnum)) {
      grouped.set(item.vnum, { prices: [], totalQty: 0, count: 0 });
    }
    const e = grouped.get(item.vnum)!;
    const unitPrice = toUnitPriceWon(item);
    if (unitPrice > 0) {
      e.prices.push(unitPrice);
    }
    e.totalQty += item.quantity;
    e.count++;
  }

  const aggregated = Array.from(grouped.entries()).map(([vnum, data]) => {
    const pf = data.prices.filter(p => p > 0);
    return {
      vnum,
      serverId: serverConfig.id,
      minPrice: pf.length > 0 ? Math.min(...pf) : 0,
      maxPrice: pf.length > 0 ? Math.max(...pf) : 0,
      avgPrice: pf.length > 0 ? pf.reduce((a, b) => a + b, 0) / pf.length : 0,
      totalListings: data.count,
      totalQuantity: data.totalQty,
      fetchedAt,
    };
  });

  if (aggregated.length === 0) return;

  const batchSize = 500;
  let inserted = 0;
  for (let i = 0; i < aggregated.length; i += batchSize) {
    const batch = aggregated.slice(i, i + batchSize);
    await db.insert(marketItemPriceHistory).values(batch);
    inserted += batch.length;
    process.stdout.write(`\r   DB: ${inserted}/${aggregated.length} price entries...`);
  }
  console.log(`\n✅ Stored ${aggregated.length} price history entries`);
}

/**
 * Main
 */
async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║     Metin2 Market Data Collector                      ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  for (const server of SERVERS) {
    try {
      const rawItems = await fetchMarketDataForServer(server);
      if (rawItems.length === 0) {
        console.log(`⚠️  No items found for ${server.name}, skipping...\n`);
        continue;
      }

      // Translate and save full item list as JSON
      console.log(`🔄 Translating ${rawItems.length} items...`);
      const translated = rawItems.map(translateItem);
      saveItemsAsJson(server, translated);

      // Store aggregated price history in DB
      console.log(`📊 Storing price history...`);
      await storePriceHistory(server, rawItems);
      console.log('');

      if (SERVERS.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`❌ Failed to process server ${server.name}:`, error);
      continue;
    }
  }

  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║                    COMPLETE                           ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');
  console.log('✅ All done! JSON files saved + price history stored.');
}

main().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
