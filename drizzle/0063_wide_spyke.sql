ALTER TABLE "booking" ADD COLUMN "original_subtotal_cents" integer;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "original_vat_cents" integer;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "original_total_cents" integer;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "override_reason" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "override_applied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "override_by_user_id" uuid;