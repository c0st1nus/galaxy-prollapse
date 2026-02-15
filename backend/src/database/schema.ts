import { pgTable, serial, text, integer, timestamp, boolean, varchar } from "drizzle-orm/pg-core";

// Users: id, name, role (admin, supervisor, cleaner, client), phone.
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role", { enum: ["admin", "supervisor", "cleaner", "client"] }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull().unique(),
  password: text("password").notNull(), // using text for hashed password
});

// Objects: id, address, description, qr_code_token (for presence check).
export const objects = pgTable("objects", {
  id: serial("id").primaryKey(),
  address: text("address").notNull(),
  description: text("description"),
  qr_code_token: text("qr_code_token").notNull().unique(),
});

// Rooms: id, object_id, type (office, bathroom, corridor), area_sqm.
export const rooms = pgTable("rooms", {
  id: serial("id").primaryKey(),
  object_id: integer("object_id").references(() => objects.id).notNull(),
  type: text("type", { enum: ["office", "bathroom", "corridor"] }).notNull(),
  area_sqm: integer("area_sqm").notNull(),
});

// Tasks: id, room_id, cleaner_id, status (pending, in_progress, completed), photo_before, photo_after, timestamp_start, timestamp_end.
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  room_id: integer("room_id").references(() => rooms.id).notNull(),
  cleaner_id: integer("cleaner_id").references(() => users.id).notNull(),
  status: text("status", { enum: ["pending", "in_progress", "completed"] }).default("pending").notNull(),
  photo_before: text("photo_before"),
  photo_after: text("photo_after"),
  timestamp_start: timestamp("timestamp_start"),
  timestamp_end: timestamp("timestamp_end"),
});

// Checklists: id, task_id, inspector_id (supervisor), score (1-5), comment.
export const checklists = pgTable("checklists", {
  id: serial("id").primaryKey(),
  task_id: integer("task_id").references(() => tasks.id).notNull(),
  inspector_id: integer("inspector_id").references(() => users.id).notNull(),
  score: integer("score").notNull(), // 1-5 validation should be handled in app logic or check constraint if supported
  comment: text("comment"),
});

// Feedback: id, object_id, client_id, rating, text.
export const feedback = pgTable("feedback", {
  id: serial("id").primaryKey(),
  object_id: integer("object_id").references(() => objects.id).notNull(),
  client_id: integer("client_id").references(() => users.id).notNull(),
  rating: integer("rating").notNull(),
  text: text("text"),
});
