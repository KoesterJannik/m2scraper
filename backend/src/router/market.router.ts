import { Router } from "express";
import { db } from "../db";
import { marketItemPriceHistory, marketServer } from "../db/schema";
import { eq, and, gte, lte, sql, desc, asc, inArray } from "drizzle-orm";
import { getGermanName, getGermanDescription, searchVnumsByName, suggestItemNames, getAttributeNames } from "../services/translation";
import { searchListings, getLoadedServers, type ListingSearchParams } from "../services/market-data";

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
    const params: ListingSearchParams = {
      search: req.query.search as string | undefined,
      minPrice: req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined,
      maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined,
      serverId: req.query.serverId ? parseInt(req.query.serverId as string) : undefined,
      category: req.query.category as string | undefined,
      attrName: req.query.attrName as string | undefined,
      attrMinValue: req.query.attrMinValue ? parseFloat(req.query.attrMinValue as string) : undefined,
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

    const translatedItems = items.map(item => ({
      ...item,
      name: getGermanName(item.vnum) || `Item #${item.vnum}`,
      description: getGermanDescription(item.vnum),
    }));

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
