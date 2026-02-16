CREATE TABLE "client_service_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"object_address" text NOT NULL,
	"object_description" text,
	"latitude" numeric(10, 8),
	"longitude" numeric(11, 8),
	"location_accuracy_meters" numeric(10, 2),
	"geofence_radius_meters" integer DEFAULT 100 NOT NULL,
	"requested_tasks" jsonb NOT NULL,
	"client_note" text,
	"decision_note" text,
	"created_object_id" integer,
	"assigned_supervisor_id" integer,
	"assigned_cleaner_id" integer,
	"reviewed_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "client_service_requests" ADD CONSTRAINT "client_service_requests_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "client_service_requests" ADD CONSTRAINT "client_service_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "client_service_requests" ADD CONSTRAINT "client_service_requests_created_object_id_objects_id_fk" FOREIGN KEY ("created_object_id") REFERENCES "public"."objects"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "client_service_requests" ADD CONSTRAINT "client_service_requests_assigned_supervisor_id_users_id_fk" FOREIGN KEY ("assigned_supervisor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "client_service_requests" ADD CONSTRAINT "client_service_requests_assigned_cleaner_id_users_id_fk" FOREIGN KEY ("assigned_cleaner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "client_service_requests" ADD CONSTRAINT "client_service_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
