ALTER TABLE "organisation" ADD COLUMN "address_lines" jsonb;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "vat_number" text;--> statement-breakpoint
ALTER TABLE "tenancy_invoice" ADD COLUMN "stripe_payment_intent_id" text;--> statement-breakpoint
ALTER TABLE "tenancy_invoice" ADD COLUMN "dd_charge_status" text;--> statement-breakpoint
ALTER TABLE "tenancy_invoice" ADD COLUMN "dd_charged_at" timestamp with time zone;