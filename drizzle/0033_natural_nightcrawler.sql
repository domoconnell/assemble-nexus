ALTER TABLE "ticket_order" ADD COLUMN "organiser_net_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_order" ADD COLUMN "stripe_fee_estimate_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_order" ADD COLUMN "stripe_fee_actual_cents" integer;