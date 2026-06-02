CREATE TABLE "booking_payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"label" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"pay_token" text NOT NULL,
	"due_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"paid_via" text,
	"stripe_payment_intent_id" text,
	"offline_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "booking_payment_pay_token_unique" UNIQUE("pay_token")
);
--> statement-breakpoint
ALTER TABLE "booking_payment" ADD CONSTRAINT "booking_payment_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_payment_booking_idx" ON "booking_payment" USING btree ("booking_id","sort_order");--> statement-breakpoint
CREATE INDEX "booking_payment_token_idx" ON "booking_payment" USING btree ("pay_token");