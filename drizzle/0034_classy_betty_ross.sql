CREATE TABLE "bank_transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"direction" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text DEFAULT 'GBP' NOT NULL,
	"counterparty_name" text,
	"counterparty_account" text,
	"reference" text,
	"category_uid" text,
	"source" text DEFAULT 'starling' NOT NULL,
	"settled_at" timestamp with time zone,
	"transaction_time" timestamp with time zone,
	"raw_payload" jsonb,
	"matched_to_id" uuid,
	"matched_to_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_balance_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"cleared_minor" integer NOT NULL,
	"effective_minor" integer NOT NULL,
	"pending_minor" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'GBP' NOT NULL,
	"source" text DEFAULT 'starling' NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD CONSTRAINT "bank_transaction_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_balance_snapshot" ADD CONSTRAINT "bank_balance_snapshot_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_transaction_venue_external_unique" ON "bank_transaction" USING btree ("venue_id","external_id");--> statement-breakpoint
CREATE INDEX "bank_transaction_venue_time_idx" ON "bank_transaction" USING btree ("venue_id","transaction_time");--> statement-breakpoint
CREATE INDEX "bank_transaction_venue_settled_idx" ON "bank_transaction" USING btree ("venue_id","settled_at");--> statement-breakpoint
CREATE INDEX "bank_balance_snapshot_venue_captured_idx" ON "bank_balance_snapshot" USING btree ("venue_id","captured_at");