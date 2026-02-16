ALTER TABLE "users" ALTER COLUMN "company_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "client_service_requests" ADD COLUMN "easy_setup_usage" text DEFAULT 'normal' NOT NULL;
--> statement-breakpoint
ALTER TABLE "client_service_requests" ADD COLUMN "recommended_cleaning_standard" text DEFAULT 'appa_3' NOT NULL;
