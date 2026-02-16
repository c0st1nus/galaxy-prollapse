CREATE TABLE "object_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"object_id" integer NOT NULL,
	"cleaner_id" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"checkin_at" timestamp DEFAULT now() NOT NULL,
	"checkout_at" timestamp,
	"last_presence_at" timestamp DEFAULT now() NOT NULL,
	"current_inside_geofence" boolean DEFAULT true NOT NULL,
	"last_distance_meters" numeric(10, 2),
	"last_latitude" numeric(10, 8),
	"last_longitude" numeric(11, 8)
);
--> statement-breakpoint
CREATE TABLE "object_presence_segments" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"object_id" integer NOT NULL,
	"cleaner_id" integer NOT NULL,
	"is_inside" boolean NOT NULL,
	"start_at" timestamp NOT NULL,
	"end_at" timestamp,
	"start_distance_meters" numeric(10, 2),
	"end_distance_meters" numeric(10, 2),
	"start_latitude" numeric(10, 8),
	"start_longitude" numeric(11, 8),
	"end_latitude" numeric(10, 8),
	"end_longitude" numeric(11, 8),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "object_sessions" ADD CONSTRAINT "object_sessions_object_id_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "object_sessions" ADD CONSTRAINT "object_sessions_cleaner_id_users_id_fk" FOREIGN KEY ("cleaner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "object_presence_segments" ADD CONSTRAINT "object_presence_segments_session_id_object_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."object_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "object_presence_segments" ADD CONSTRAINT "object_presence_segments_object_id_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "object_presence_segments" ADD CONSTRAINT "object_presence_segments_cleaner_id_users_id_fk" FOREIGN KEY ("cleaner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

