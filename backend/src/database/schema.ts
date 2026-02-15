import {integer, pgTable, serial, text, timestamp, unique} from "drizzle-orm/pg-core";
import {relations} from "drizzle-orm";

// Companies: id, name, created_at
export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  created_at: timestamp("created_at").defaultNow(),
});

// Users: id, company_id, name, role (admin, supervisor, cleaner, client), email, password.
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  company_id: integer("company_id").references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  name: text("name").notNull(),
  role: text("role", { enum: ["admin", "supervisor", "cleaner", "client"] }).notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(), // using text for hashed password
});

// Objects: id, company_id, address, description
export const objects = pgTable("objects", {
  id: serial("id").primaryKey(),
  company_id: integer("company_id").references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  address: text("address").notNull(),
  description: text("description"),
});

// Rooms: id, object_id, type (office, bathroom, corridor), area_sqm.
export const rooms = pgTable("rooms", {
  id: serial("id").primaryKey(),
  object_id: integer("object_id").references(() => objects.id, { onDelete: 'cascade' }).notNull(),
  type: text("type", { enum: ["office", "bathroom", "corridor"] }).notNull(),
  area_sqm: integer("area_sqm").notNull(),
});

// Tasks: id, room_id, cleaner_id, status (pending, in_progress, completed), photo_before, photo_after, timestamp_start, timestamp_end.
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  room_id: integer("room_id").references(() => rooms.id, { onDelete: 'cascade' }).notNull(),
  cleaner_id: integer("cleaner_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  status: text("status", { enum: ["pending", "in_progress", "completed"] }).default("pending").notNull(),
  photo_before: text("photo_before"),
  photo_after: text("photo_after"),
  timestamp_start: timestamp("timestamp_start"),
  timestamp_end: timestamp("timestamp_end"),
});

// Checklists: id, task_id, inspector_id (supervisor), score (1-5), comment.
export const checklists = pgTable("checklists", {
  id: serial("id").primaryKey(),
  task_id: integer("task_id").references(() => tasks.id, { onDelete: 'cascade' }).notNull(),
  inspector_id: integer("inspector_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  score: integer("score").notNull(), // 1-5 validation should be handled in app logic or check constraint if supported
  comment: text("comment"),
}, (table) => [unique("checklists_task_id_unique").on(table.task_id)]);

// Feedback: id, object_id, client_id, rating, text.
export const feedback = pgTable("feedback", {
  id: serial("id").primaryKey(),
  object_id: integer("object_id").references(() => objects.id, { onDelete: 'cascade' }).notNull(),
  client_id: integer("client_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  rating: integer("rating").notNull(),
  text: text("text"),
});

// drizzle relations (used by db.query and for proper type inference)

export const companiesRelations = relations(companies, ({many}) => ({
  users: many(users),
  objects: many(objects),
}));

export const usersRelations = relations(users, ({one, many}) => ({
  company: one(companies, {fields: [users.company_id], references: [companies.id]}),
  tasks: many(tasks),
  checklists: many(checklists),
  feedback: many(feedback),
}));

export const objectsRelations = relations(objects, ({one, many}) => ({
  company: one(companies, {fields: [objects.company_id], references: [companies.id]}),
  rooms: many(rooms),
  feedback: many(feedback),
}));

export const roomsRelations = relations(rooms, ({one, many}) => ({
  object: one(objects, {fields: [rooms.object_id], references: [objects.id]}),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({one}) => ({
  room: one(rooms, {fields: [tasks.room_id], references: [rooms.id]}),
  cleaner: one(users, {fields: [tasks.cleaner_id], references: [users.id]}),
  checklist: one(checklists),
}));

export const checklistsRelations = relations(checklists, ({one}) => ({
  task: one(tasks, {fields: [checklists.task_id], references: [tasks.id]}),
  inspector: one(users, {fields: [checklists.inspector_id], references: [users.id]}),
}));

export const feedbackRelations = relations(feedback, ({one}) => ({
  object: one(objects, {fields: [feedback.object_id], references: [objects.id]}),
  client: one(users, {fields: [feedback.client_id], references: [users.id]}),
}));
