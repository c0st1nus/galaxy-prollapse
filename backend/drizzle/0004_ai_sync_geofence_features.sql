ALTER TABLE "objects" ADD COLUMN "latitude" numeric(10, 8);--> statement-breakpoint
ALTER TABLE "objects" ADD COLUMN "longitude" numeric(11, 8);--> statement-breakpoint
ALTER TABLE "objects" ADD COLUMN "geofence_radius_meters" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "objects" ADD COLUMN "cleaning_standard" text DEFAULT 'appa_2' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "checkin_latitude" numeric(10, 8);--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "checkin_longitude" numeric(11, 8);--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "checkout_latitude" numeric(10, 8);--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "checkout_longitude" numeric(11, 8);--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "ai_status" text DEFAULT 'not_requested' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "ai_model" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "ai_score" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "ai_feedback" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "ai_raw" jsonb;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "ai_rated_at" timestamp;--> statement-breakpoint
CREATE TABLE "checklist_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"room_type" text NOT NULL,
	"cleaning_standard" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"items" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "checklist_templates_room_standard_version_unique" UNIQUE("company_id", "room_type", "cleaning_standard", "version")
);
--> statement-breakpoint
CREATE TABLE "task_checklists" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"template_id" integer,
	"items" jsonb NOT NULL,
	"completion_percent" integer DEFAULT 0 NOT NULL,
	"generated_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "task_checklists_task_id_unique" UNIQUE("task_id")
);
--> statement-breakpoint
CREATE TABLE "sync_operations" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_operation_id" text NOT NULL,
	"cleaner_id" integer NOT NULL,
	"task_id" integer NOT NULL,
	"operation_type" text NOT NULL,
	"payload_hash" text,
	"status" text NOT NULL,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now(),
	"processed_at" timestamp,
	CONSTRAINT "sync_operations_client_operation_id_unique" UNIQUE("client_operation_id")
);
--> statement-breakpoint
CREATE TABLE "task_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"actor_id" integer,
	"event_type" text NOT NULL,
	"event_time" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "geofence_violations" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"cleaner_id" integer NOT NULL,
	"phase" text NOT NULL,
	"distance_meters" numeric(10, 2) NOT NULL,
	"allowed_radius_meters" integer NOT NULL,
	"latitude" numeric(10, 8),
	"longitude" numeric(11, 8),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_checklists" ADD CONSTRAINT "task_checklists_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_checklists" ADD CONSTRAINT "task_checklists_template_id_checklist_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_cleaner_id_users_id_fk" FOREIGN KEY ("cleaner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geofence_violations" ADD CONSTRAINT "geofence_violations_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geofence_violations" ADD CONSTRAINT "geofence_violations_cleaner_id_users_id_fk" FOREIGN KEY ("cleaner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
