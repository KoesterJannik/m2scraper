import { Router } from "express";
import { db } from "../db";
import { bookmark } from "../db/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

/**
 * GET /api/bookmarks
 * List all bookmarks for the current user
 */
router.get("/", async (req, res) => {
  try {
    const userId = (req as any).session.user.id;
    const bookmarks = await db
      .select()
      .from(bookmark)
      .where(eq(bookmark.userId, userId))
      .orderBy(bookmark.createdAt);
    res.json({ bookmarks });
  } catch (error) {
    console.error("Error fetching bookmarks:", error);
    res.status(500).json({ error: "Failed to fetch bookmarks" });
  }
});

/**
 * POST /api/bookmarks
 * Add a bookmark: { vnum, sellerName, itemName, serverId? }
 */
router.post("/", async (req, res) => {
  try {
    const userId = (req as any).session.user.id;
    const { vnum, sellerName, itemName, serverId } = req.body;

    if (!vnum || !sellerName || !itemName) {
      return res.status(400).json({ error: "vnum, sellerName, and itemName are required" });
    }

    // Check duplicate
    const existing = await db
      .select()
      .from(bookmark)
      .where(
        and(
          eq(bookmark.userId, userId),
          eq(bookmark.vnum, vnum),
          eq(bookmark.sellerName, sellerName),
        )
      );

    if (existing.length > 0) {
      return res.status(409).json({ error: "Bookmark already exists" });
    }

    const [created] = await db
      .insert(bookmark)
      .values({ userId, vnum, sellerName, itemName, serverId: serverId || null })
      .returning();

    res.status(201).json({ bookmark: created });
  } catch (error) {
    console.error("Error creating bookmark:", error);
    res.status(500).json({ error: "Failed to create bookmark" });
  }
});

/**
 * DELETE /api/bookmarks/:id
 */
router.delete("/:id", async (req, res) => {
  try {
    const userId = (req as any).session.user.id;
    const id = parseInt(req.params.id);

    await db
      .delete(bookmark)
      .where(and(eq(bookmark.id, id), eq(bookmark.userId, userId)));

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting bookmark:", error);
    res.status(500).json({ error: "Failed to delete bookmark" });
  }
});

export default router;
