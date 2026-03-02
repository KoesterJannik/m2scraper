import { Router } from "express";
import { db } from "../db";
import { message } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

/**
 * GET /api/messages
 * List all messages for the current user (newest first)
 */
router.get("/", async (req, res) => {
  try {
    const userId = (req as any).session.user.id;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

    const messages = await db
      .select()
      .from(message)
      .where(eq(message.userId, userId))
      .orderBy(desc(message.createdAt))
      .limit(limit);

    // Count unread
    const allMessages = await db
      .select()
      .from(message)
      .where(and(eq(message.userId, userId), eq(message.read, false)));

    res.json({ messages, unreadCount: allMessages.length });
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

/**
 * PATCH /api/messages/:id/read
 * Mark a message as read
 */
router.patch("/:id/read", async (req, res) => {
  try {
    const userId = (req as any).session.user.id;
    const id = parseInt(req.params.id);

    await db
      .update(message)
      .set({ read: true })
      .where(and(eq(message.id, id), eq(message.userId, userId)));

    res.json({ success: true });
  } catch (error) {
    console.error("Error marking message read:", error);
    res.status(500).json({ error: "Failed to mark message as read" });
  }
});

/**
 * POST /api/messages/read-all
 * Mark all messages as read
 */
router.post("/read-all", async (req, res) => {
  try {
    const userId = (req as any).session.user.id;

    await db
      .update(message)
      .set({ read: true })
      .where(and(eq(message.userId, userId), eq(message.read, false)));

    res.json({ success: true });
  } catch (error) {
    console.error("Error marking all messages read:", error);
    res.status(500).json({ error: "Failed to mark all messages as read" });
  }
});

/**
 * DELETE /api/messages/:id
 */
router.delete("/:id", async (req, res) => {
  try {
    const userId = (req as any).session.user.id;
    const id = parseInt(req.params.id);

    await db
      .delete(message)
      .where(and(eq(message.id, id), eq(message.userId, userId)));

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting message:", error);
    res.status(500).json({ error: "Failed to delete message" });
  }
});

export default router;
