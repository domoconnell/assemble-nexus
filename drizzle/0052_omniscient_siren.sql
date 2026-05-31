ALTER TABLE "tenancy" ADD COLUMN "monthly_override_cents" integer;--> statement-breakpoint
ALTER TABLE "tenancy_invoice" ADD COLUMN "uncapped_subtotal_cents" integer;