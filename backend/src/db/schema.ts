import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, boolean, index, integer, bigint, real, serial } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

// Market Data Schema

export const marketServer = pgTable("market_server", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  lastFetchedAt: timestamp("last_fetched_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .$onUpdate(() => new Date())
    .defaultNow()
    .notNull(),
});

// Price history — one row per vnum per server per fetch
export const marketItemPriceHistory = pgTable(
  "market_item_price_history",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    vnum: integer("vnum").notNull(),
    serverId: integer("server_id")
      .notNull()
      .references(() => marketServer.id, { onDelete: "cascade" }),
    avgPrice: real("avg_price").default(0).notNull(),
    minPrice: real("min_price").default(0).notNull(),
    maxPrice: real("max_price").default(0).notNull(),
    totalListings: integer("total_listings").default(0).notNull(),
    totalQuantity: integer("total_quantity").default(0).notNull(),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  },
  (table) => [
    index("price_history_vnum_idx").on(table.vnum),
    index("price_history_server_id_idx").on(table.serverId),
    index("price_history_fetched_at_idx").on(table.fetchedAt),
    index("price_history_vnum_server_idx").on(table.vnum, table.serverId),
    index("price_history_vnum_server_fetched_idx").on(table.vnum, table.serverId, table.fetchedAt),
  ]
);

export const marketServerRelations = relations(marketServer, ({ many }) => ({
  priceHistory: many(marketItemPriceHistory),
}));

export const marketItemPriceHistoryRelations = relations(marketItemPriceHistory, ({ one }) => ({
  server: one(marketServer, {
    fields: [marketItemPriceHistory.serverId],
    references: [marketServer.id],
  }),
}));

// ── Bookmarks ──

export const bookmark = pgTable(
  "bookmark",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    vnum: integer("vnum").notNull(),
    sellerName: text("seller_name").notNull(),
    itemName: text("item_name").notNull(), // cached for display
    serverId: integer("server_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("bookmark_user_id_idx").on(table.userId),
    index("bookmark_vnum_seller_idx").on(table.userId, table.vnum, table.sellerName),
  ]
);

// ── Price Alerts ──

export const priceAlert = pgTable(
  "price_alert",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    vnum: integer("vnum").notNull(),
    serverId: integer("server_id")
      .notNull()
      .references(() => marketServer.id, { onDelete: "cascade" }),
    itemName: text("item_name").notNull(), // cached for display
    priceThreshold: real("price_threshold").notNull(), // in Won
    direction: text("direction").notNull().default("below"), // "below" = alert when price drops below, "above" = alert when price goes above
    active: boolean("active").default(true).notNull(),
    lastTriggeredAt: timestamp("last_triggered_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("price_alert_user_id_idx").on(table.userId),
    index("price_alert_vnum_server_idx").on(table.vnum, table.serverId),
    index("price_alert_active_idx").on(table.active),
  ]
);

// ── Messages (inbox) ──

export const message = pgTable(
  "message",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    read: boolean("read").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("message_user_id_idx").on(table.userId),
    index("message_user_read_idx").on(table.userId, table.read),
  ]
);
