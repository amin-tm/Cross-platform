import { pgTable, uuid, varchar, text, timestamp, bigint, integer } from "drizzle-orm/pg-core";

export const transfers = pgTable("transfers", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 6 }).notNull().unique(),
  ownerId: uuid("owner_id").notNull(),
  contributorId: uuid("contributor_id"),
  kind: varchar("kind", { length: 12 }).notNull().default("send"),
  status: varchar("status", { length: 12 }).notNull().default("pending"),
  totalSize: bigint("total_size", { mode: "number" }).notNull().default(0),
  fileCount: integer("file_count").notNull().default(0),
  textContent: text("text_content"),
  downloads: integer("downloads").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const transferFiles = pgTable("transfer_files", {
  id: uuid("id").primaryKey(),
  transferId: uuid("transfer_id").notNull().references(() => transfers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  mime: text("mime").notNull().default("application/octet-stream"),
  size: bigint("size", { mode: "number" }).notNull(),
  storageName: text("storage_name").notNull(),
  status: varchar("status", { length: 12 }).notNull().default("ready"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Phone numbers collected before the contact links are revealed. */
export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  phone: varchar("phone", { length: 20 }).notNull().unique(),
  visits: integer("visits").notNull().default(1),
  source: varchar("source", { length: 40 }).notNull().default("contact-popup"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export const feedback = pgTable("feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
