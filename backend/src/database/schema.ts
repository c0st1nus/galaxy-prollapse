import {
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
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
  latitude: numeric("latitude", { precision: 10, scale: 8 }),
  longitude: numeric("longitude", { precision: 11, scale: 8 }),
  geofence_radius_meters: integer("geofence_radius_meters").default(100).notNull(),
  cleaning_standard: text("cleaning_standard").default("appa_2").notNull(),
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
  checkin_latitude: numeric("checkin_latitude", { precision: 10, scale: 8 }),
  checkin_longitude: numeric("checkin_longitude", { precision: 11, scale: 8 }),
  checkout_latitude: numeric("checkout_latitude", { precision: 10, scale: 8 }),
  checkout_longitude: numeric("checkout_longitude", { precision: 11, scale: 8 }),
  ai_status: text("ai_status", { enum: ["not_requested", "pending", "succeeded", "failed"] }).default("not_requested").notNull(),
  ai_model: text("ai_model"),
  ai_score: integer("ai_score"),
  ai_feedback: text("ai_feedback"),
  ai_raw: jsonb("ai_raw"),
  ai_rated_at: timestamp("ai_rated_at"),
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

// Checklist templates: adaptive checklist source by room type + standard.
export const checklistTemplates = pgTable("checklist_templates", {
  id: serial("id").primaryKey(),
  company_id: integer("company_id").references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  room_type: text("room_type", { enum: ["office", "bathroom", "corridor"] }).notNull(),
  cleaning_standard: text("cleaning_standard").notNull(),
  version: integer("version").default(1).notNull(),
  items: jsonb("items").notNull(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
}, (table) => [unique("checklist_templates_room_standard_version_unique").on(table.company_id, table.room_type, table.cleaning_standard, table.version)]);

// Task checklists: task-scoped checklist instance generated from template.
export const taskChecklists = pgTable("task_checklists", {
  id: serial("id").primaryKey(),
  task_id: integer("task_id").references(() => tasks.id, { onDelete: "cascade" }).notNull().unique(),
  template_id: integer("template_id").references(() => checklistTemplates.id, { onDelete: "set null" }),
  items: jsonb("items").notNull(),
  completion_percent: integer("completion_percent").default(0).notNull(),
  generated_at: timestamp("generated_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// Sync operations: idempotency and replay audit for offline sync.
export const syncOperations = pgTable("sync_operations", {
  id: serial("id").primaryKey(),
  client_operation_id: text("client_operation_id").notNull().unique(),
  cleaner_id: integer("cleaner_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  task_id: integer("task_id").references(() => tasks.id, { onDelete: "cascade" }).notNull(),
  operation_type: text("operation_type").notNull(),
  payload_hash: text("payload_hash"),
  status: text("status", { enum: ["applied", "duplicate", "rejected", "retryable_error"] }).notNull(),
  error_code: text("error_code"),
  error_message: text("error_message"),
  created_at: timestamp("created_at").defaultNow(),
  processed_at: timestamp("processed_at"),
});

// Task events: append-only timeline for auditing and analytics.
export const taskEvents = pgTable("task_events", {
  id: serial("id").primaryKey(),
  task_id: integer("task_id").references(() => tasks.id, { onDelete: "cascade" }).notNull(),
  actor_id: integer("actor_id").references(() => users.id, { onDelete: "set null" }),
  event_type: text("event_type").notNull(),
  event_time: timestamp("event_time").defaultNow().notNull(),
  metadata: jsonb("metadata"),
});

// Geofence violations: blocked task transitions with distance details.
export const geofenceViolations = pgTable("geofence_violations", {
  id: serial("id").primaryKey(),
  task_id: integer("task_id").references(() => tasks.id, { onDelete: "cascade" }).notNull(),
  cleaner_id: integer("cleaner_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  phase: text("phase", { enum: ["start", "complete"] }).notNull(),
  distance_meters: numeric("distance_meters", { precision: 10, scale: 2 }).notNull(),
  allowed_radius_meters: integer("allowed_radius_meters").notNull(),
  latitude: numeric("latitude", { precision: 10, scale: 8 }),
  longitude: numeric("longitude", { precision: 11, scale: 8 }),
  created_at: timestamp("created_at").defaultNow(),
});

// drizzle relations (used by db.query and for proper type inference)

export const companiesRelations = relations(companies, ({many}) => ({
  users: many(users),
  objects: many(objects),
  checklistTemplates: many(checklistTemplates),
}));

export const usersRelations = relations(users, ({one, many}) => ({
  company: one(companies, {fields: [users.company_id], references: [companies.id]}),
  tasks: many(tasks),
  checklists: many(checklists),
  feedback: many(feedback),
  syncOperations: many(syncOperations),
  taskEvents: many(taskEvents),
  geofenceViolations: many(geofenceViolations),
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

export const tasksRelations = relations(tasks, ({one, many}) => ({
  room: one(rooms, {fields: [tasks.room_id], references: [rooms.id]}),
  cleaner: one(users, {fields: [tasks.cleaner_id], references: [users.id]}),
  checklist: one(checklists),
  taskChecklist: one(taskChecklists),
  syncOperations: many(syncOperations),
  events: many(taskEvents),
  geofenceViolations: many(geofenceViolations),
}));

export const checklistsRelations = relations(checklists, ({one}) => ({
  task: one(tasks, {fields: [checklists.task_id], references: [tasks.id]}),
  inspector: one(users, {fields: [checklists.inspector_id], references: [users.id]}),
}));

export const feedbackRelations = relations(feedback, ({one}) => ({
  object: one(objects, {fields: [feedback.object_id], references: [objects.id]}),
  client: one(users, {fields: [feedback.client_id], references: [users.id]}),
}));

export const checklistTemplatesRelations = relations(checklistTemplates, ({one, many}) => ({
  company: one(companies, {fields: [checklistTemplates.company_id], references: [companies.id]}),
  taskChecklists: many(taskChecklists),
}));

export const taskChecklistsRelations = relations(taskChecklists, ({one}) => ({
  task: one(tasks, {fields: [taskChecklists.task_id], references: [tasks.id]}),
  template: one(checklistTemplates, {fields: [taskChecklists.template_id], references: [checklistTemplates.id]}),
}));

export const syncOperationsRelations = relations(syncOperations, ({one}) => ({
  cleaner: one(users, {fields: [syncOperations.cleaner_id], references: [users.id]}),
  task: one(tasks, {fields: [syncOperations.task_id], references: [tasks.id]}),
}));

export const taskEventsRelations = relations(taskEvents, ({one}) => ({
  task: one(tasks, {fields: [taskEvents.task_id], references: [tasks.id]}),
  actor: one(users, {fields: [taskEvents.actor_id], references: [users.id]}),
}));

export const geofenceViolationsRelations = relations(geofenceViolations, ({one}) => ({
  task: one(tasks, {fields: [geofenceViolations.task_id], references: [tasks.id]}),
  cleaner: one(users, {fields: [geofenceViolations.cleaner_id], references: [users.id]}),
}));
