ALTER TABLE "organisation" ADD COLUMN "dd_token" text;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "direct_debit_mandate_id" text;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "direct_debit_ready_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "organisation_dd_token_idx" ON "organisation" USING btree ("dd_token");