CREATE TABLE "psp_intent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"status" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'gbp' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ticket_order_id" uuid,
	"booking_id" uuid,
	"client_secret_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "psp_intent" ADD CONSTRAINT "psp_intent_ticket_order_id_ticket_order_id_fk" FOREIGN KEY ("ticket_order_id") REFERENCES "public"."ticket_order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psp_intent" ADD CONSTRAINT "psp_intent_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "psp_intent_provider_external_idx" ON "psp_intent" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "psp_intent_ticket_order_idx" ON "psp_intent" USING btree ("ticket_order_id");--> statement-breakpoint
CREATE INDEX "psp_intent_booking_idx" ON "psp_intent" USING btree ("booking_id");