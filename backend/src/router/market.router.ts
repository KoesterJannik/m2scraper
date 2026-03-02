import { Router } from "express";
import { db } from "../db";
import { marketItemPriceHistory, marketServer } from "../db/schema";
import { eq, and, gte, lte, sql, desc, asc, inArray, or } from "drizzle-orm";
import { getGermanName, getGermanDescription, searchVnumsByName, suggestItemNames, getAttributeNames } from "../services/translation";
import { searchListings, getLoadedServers, type ListingSearchParams, type AttrFilter } from "../services/market-data";

const router = Router();

// ─────────────────────────────────────────────────────────────
// LIVE LISTINGS (from JSON files — full item data with seller, attrs, etc.)
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/market/listings
 * Search the full market item listings (served from JSON files).
 * Returns individual items with seller, attributes, etc.
 */
router.get("/listings", async (req, res) => {
  try {
    // Parse multi-attribute filters: attrs=name1:value1|name2:value2|name3
    let attrs: AttrFilter[] | undefined;
    if (req.query.attrs && typeof req.query.attrs === 'string') {
      attrs = (req.query.attrs as string)
        .split('|')
        .filter(Boolean)
        .map(pair => {
          const colonIdx = pair.indexOf(':');
          if (colonIdx === -1) return { name: pair.trim() };
          const name = pair.slice(0, colonIdx).trim();
          const valStr = pair.slice(colonIdx + 1).trim();
          const minValue = valStr ? parseFloat(valStr) : undefined;
          return { name, minValue: minValue !== undefined && !isNaN(minValue) ? minValue : undefined };
        })
        .filter(a => a.name.length > 0);
      if (attrs.length === 0) attrs = undefined;
    }

    const params: ListingSearchParams = {
      search: req.query.search as string | undefined,
      minPrice: req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined,
      maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined,
      serverId: req.query.serverId ? parseInt(req.query.serverId as string) : undefined,
      category: req.query.category as string | undefined,
      attrs,
      minLevel: req.query.minLevel ? parseInt(req.query.minLevel as string) : undefined,
      maxLevel: req.query.maxLevel ? parseInt(req.query.maxLevel as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
      sortBy: (req.query.sortBy as ListingSearchParams['sortBy']) || 'price',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
    };

    const result = searchListings(params);
    res.json(result);
  } catch (error) {
    console.error("Error searching listings:", error);
    res.status(500).json({ error: "Failed to search listings" });
  }
});

// ─────────────────────────────────────────────────────────────
// PRICE HISTORY (from DB — aggregated min/max/avg per vnum)
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/market/items
 * Search aggregated price data (latest snapshot per vnum per server).
 * Names translated on the fly.
 */
router.get("/items", async (req, res) => {
  try {
    const {
      search,
      minPrice,
      maxPrice,
      serverId,
      limit = "50",
      offset = "0",
      sortBy = "price",
      sortOrder = "desc",
    } = req.query;

    const limitNum = Math.min(parseInt(limit as string) || 50, 500);
    const offsetNum = parseInt(offset as string) || 0;

    const conditions = [];

    if (search) {
      const searchStr = search as string;
      const searchNum = parseInt(searchStr);
      if (!isNaN(searchNum)) {
        conditions.push(eq(marketItemPriceHistory.vnum, searchNum));
      } else {
        const matchingVnums = searchVnumsByName(searchStr);
        if (matchingVnums.length === 0) {
          return res.json({
            items: [],
            pagination: { total: 0, limit: limitNum, offset: offsetNum, hasMore: false },
          });
        }
        conditions.push(inArray(marketItemPriceHistory.vnum, matchingVnums));
      }
    }

    if (minPrice) conditions.push(gte(marketItemPriceHistory.avgPrice, parseFloat(minPrice as string)));
    if (maxPrice) conditions.push(lte(marketItemPriceHistory.avgPrice, parseFloat(maxPrice as string)));
    if (serverId) conditions.push(eq(marketItemPriceHistory.serverId, parseInt(serverId as string)));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Subquery: latest fetch per (vnum, serverId)
    const latestFetchSubquery = db
      .select({
        vnum: marketItemPriceHistory.vnum,
        serverId: marketItemPriceHistory.serverId,
        maxFetchedAt: sql<Date>`MAX(${marketItemPriceHistory.fetchedAt})`.as("max_fetched_at"),
      })
      .from(marketItemPriceHistory)
      .groupBy(marketItemPriceHistory.vnum, marketItemPriceHistory.serverId)
      .as("latest_fetch");

    let orderBy;
    switch (sortBy) {
      case "vnum":
        orderBy = sortOrder === "asc" ? asc(marketItemPriceHistory.vnum) : desc(marketItemPriceHistory.vnum);
        break;
      default: // "price"
        orderBy = sortOrder === "asc" ? asc(marketItemPriceHistory.avgPrice) : desc(marketItemPriceHistory.avgPrice);
    }

    const items = await db
      .select({
        id: marketItemPriceHistory.id,
        vnum: marketItemPriceHistory.vnum,
        serverId: marketItemPriceHistory.serverId,
        avgPrice: marketItemPriceHistory.avgPrice,
        minPrice: marketItemPriceHistory.minPrice,
        maxPrice: marketItemPriceHistory.maxPrice,
        totalListings: marketItemPriceHistory.totalListings,
        totalQuantity: marketItemPriceHistory.totalQuantity,
        fetchedAt: marketItemPriceHistory.fetchedAt,
      })
      .from(marketItemPriceHistory)
      .innerJoin(
        latestFetchSubquery,
        and(
          eq(marketItemPriceHistory.vnum, latestFetchSubquery.vnum),
          eq(marketItemPriceHistory.serverId, latestFetchSubquery.serverId),
          eq(marketItemPriceHistory.fetchedAt, latestFetchSubquery.maxFetchedAt),
        )
      )
      .where(whereClause)
      .orderBy(orderBy)
      .limit(limitNum)
      .offset(offsetNum);

    const totalResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(marketItemPriceHistory)
      .innerJoin(
        latestFetchSubquery,
        and(
          eq(marketItemPriceHistory.vnum, latestFetchSubquery.vnum),
          eq(marketItemPriceHistory.serverId, latestFetchSubquery.serverId),
          eq(marketItemPriceHistory.fetchedAt, latestFetchSubquery.maxFetchedAt),
        )
      )
      .where(whereClause);

    const total = totalResult[0]?.count || 0;

    // ── Price change calculations (24h, 7d, 30d) ──
    // For each returned item, find the closest historical price before each cutoff
    const now = new Date();
    const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const cutoff7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const cutoff30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Build a map of historical prices per (vnum, serverId) for each period
    type PriceChangeMap = Map<string, number>; // key: "vnum-serverId"

    async function getHistoricalPrices(cutoff: Date): Promise<PriceChangeMap> {
      if (items.length === 0) return new Map();

      // For each (vnum, serverId) pair, get the avg_price of the most recent record
      // that was fetched at or before the cutoff date.
      const rows = await db.execute(sql`
        SELECT DISTINCT ON (vnum, server_id)
          vnum, server_id, avg_price
        FROM market_item_price_history
        WHERE fetched_at <= ${cutoff}
          AND (vnum, server_id) IN (${sql.join(
            items.map(i => sql`(${i.vnum}, ${i.serverId})`),
            sql`, `
          )})
        ORDER BY vnum, server_id, fetched_at DESC
      `);

      const map: PriceChangeMap = new Map();
      for (const row of rows.rows as any[]) {
        map.set(`${row.vnum}-${row.server_id}`, parseFloat(row.avg_price));
      }
      return map;
    }

    const [prices24h, prices7d, prices30d] = await Promise.all([
      getHistoricalPrices(cutoff24h),
      getHistoricalPrices(cutoff7d),
      getHistoricalPrices(cutoff30d),
    ]);

    function calcChange(current: number, old: number | undefined): number | null {
      if (old === undefined || old === 0) return null;
      return ((current - old) / old) * 100;
    }

    const translatedItems = items.map(item => {
      const key = `${item.vnum}-${item.serverId}`;
      return {
        ...item,
        name: getGermanName(item.vnum) || `Item #${item.vnum}`,
        description: getGermanDescription(item.vnum),
        change24h: calcChange(item.avgPrice, prices24h.get(key)),
        change7d: calcChange(item.avgPrice, prices7d.get(key)),
        change30d: calcChange(item.avgPrice, prices30d.get(key)),
      };
    });

    res.json({
      items: translatedItems,
      pagination: { total, limit: limitNum, offset: offsetNum, hasMore: offsetNum + limitNum < total },
    });
  } catch (error) {
    console.error("Error fetching market items:", error);
    res.status(500).json({ error: "Failed to fetch market items" });
  }
});

/**
 * GET /api/market/price-history/:vnum
 */
router.get("/price-history/:vnum", async (req, res) => {
  try {
    const { vnum } = req.params;
    const { serverId } = req.query;

    const conditions = [eq(marketItemPriceHistory.vnum, parseInt(vnum))];
    if (serverId) conditions.push(eq(marketItemPriceHistory.serverId, parseInt(serverId as string)));

    const history = await db
      .select()
      .from(marketItemPriceHistory)
      .where(and(...conditions))
      .orderBy(asc(marketItemPriceHistory.fetchedAt));

    const name = getGermanName(parseInt(vnum)) || `Item #${vnum}`;
    const description = getGermanDescription(parseInt(vnum));

    res.json({ name, description, history });
  } catch (error) {
    console.error("Error fetching price history:", error);
    res.status(500).json({ error: "Failed to fetch price history" });
  }
});

/**
 * GET /api/market/suggest-names?q=...
 * Returns matching item names for autocomplete
 */
router.get("/suggest-names", async (req, res) => {
  try {
    const q = (req.query.q as string) || "";
    if (q.length < 2) return res.json({ names: [] });
    const names = suggestItemNames(q, 15);
    res.json({ names });
  } catch (error) {
    console.error("Error suggesting names:", error);
    res.status(500).json({ error: "Failed to suggest names" });
  }
});

/**
 * GET /api/market/attribute-names
 * Returns all available attribute names for autocomplete
 */
router.get("/attribute-names", async (_req, res) => {
  try {
    const names = getAttributeNames();
    res.json({ names });
  } catch (error) {
    console.error("Error fetching attribute names:", error);
    res.status(500).json({ error: "Failed to fetch attribute names" });
  }
});

/**
 * GET /api/market/servers
 */
router.get("/servers", async (_req, res) => {
  try {
    // Get servers from DB
    const dbServers = await db
      .select({ id: marketServer.id, name: marketServer.name, lastFetchedAt: marketServer.lastFetchedAt })
      .from(marketServer);

    // Enrich with JSON listing counts
    const jsonServers = getLoadedServers();
    const jsonMap = new Map(jsonServers.map(s => [s.serverId, s]));

    const servers = dbServers.map(s => ({
      ...s,
      totalItems: jsonMap.get(s.id)?.totalItems || 0,
    }));

    res.json({ servers });
  } catch (error) {
    console.error("Error fetching servers:", error);
    res.status(500).json({ error: "Failed to fetch servers" });
  }
});

export default router;
