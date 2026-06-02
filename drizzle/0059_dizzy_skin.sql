ALTER TABLE "tenancy_invoice" ADD COLUMN "rack_subtotal_cents" integer;--> statement-breakpoint
ALTER TABLE "tenancy_invoice" ADD COLUMN "line_discount_total_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenancy_invoice_line" ADD COLUMN "rack_hourly_rate_cents" integer;--> statement-breakpoint
ALTER TABLE "tenancy_invoice_line" ADD COLUMN "rack_cents" integer;--> statement-breakpoint
ALTER TABLE "tenancy_invoice_line" ADD COLUMN "discount_cents" integer;