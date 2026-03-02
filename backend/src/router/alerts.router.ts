import { Router } from "express";
import { db } from "../db";
import { priceAlert } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

/**
 * GET /api/alerts
 * List all price alerts for the current user
 */
router.get("/", async (req, res) => {
  try {
    const userId = (req as any).session.user.id;
    const alerts = await db
      .select()
      .from(priceAlert)
      .where(eq(priceAlert.userId, userId))
      .orderBy(desc(priceAlert.createdAt));
    res.json({ alerts });
  } catch (error) {
    console.error("Error fetching alerts:", error);
    res.status(500).json({ error: "Failed to fetch alerts" });
  }
});

/**
 * POST /api/alerts
 * Create a price alert: { vnum, serverId, itemName, priceThreshold, direction }
 */
router.post("/", async (req, res) => {
  try {
    const userId = (req as any).session.user.id;
    const { vnum, serverId, itemName, priceThreshold, direction } = req.body;

    if (!vnum || !serverId || !itemName || priceThreshold === undefined || !direction) {
      return res.status(400).json({ error: "vnum, serverId, itemName, priceThreshold, and direction are required" });
    }

    if (!["above", "below"].includes(direction)) {
      return res.status(400).json({ error: "direction must be 'above' or 'below'" });
    }

    const [created] = await db
      .insert(priceAlert)
      .values({
        userId,
        vnum,
        serverId: parseInt(serverId),
        itemName,
        priceThreshold: parseFloat(priceThreshold),
        direction,
      })
      .returning();

    res.status(201).json({ alert: created });
  } catch (error) {
    console.error("Error creating alert:", error);
    res.status(500).json({ error: "Failed to create alert" });
  }
});

/**
 * DELETE /api/alerts/:id
 */
router.delete("/:id", async (req, res) => {
  try {
    const userId = (req as any).session.user.id;
    const id = parseInt(req.params.id);

    await db
      .delete(priceAlert)
      .where(and(eq(priceAlert.id, id), eq(priceAlert.userId, userId)));

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting alert:", error);
    res.status(500).json({ error: "Failed to delete alert" });
  }
});

/**
 * PATCH /api/alerts/:id/toggle
 * Toggle active status
 */
router.patch("/:id/toggle", async (req, res) => {
  try {
    const userId = (req as any).session.user.id;
    const id = parseInt(req.params.id);

    const existing = await db
      .select()
      .from(priceAlert)
      .where(and(eq(priceAlert.id, id), eq(priceAlert.userId, userId)));

    if (existing.length === 0) {
      return res.status(404).json({ error: "Alert not found" });
    }

    const [updated] = await db
      .update(priceAlert)
      .set({ active: !existing[0]!.active })
      .where(eq(priceAlert.id, id))
      .returning();

    res.json({ alert: updated });
  } catch (error) {
    console.error("Error toggling alert:", error);
    res.status(500).json({ error: "Failed to toggle alert" });
  }
});

export default router;
