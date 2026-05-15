CREATE TABLE "bank_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"label" text NOT NULL,
	"external_account_uid" text,
	"credentials" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"currency" text DEFAULT 'GBP' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DROP INDEX "bank_transaction_venue_external_unique";--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD COLUMN "bank_account_id" uuid;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD COLUMN "is_transfer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_balance_snapshot" ADD COLUMN "bank_account_id" uuid;--> statement-breakpoint
ALTER TABLE "bank_account" ADD CONSTRAINT "bank_account_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_account_venue_active_idx" ON "bank_account" USING btree ("venue_id","is_active");--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD CONSTRAINT "bank_transaction_bank_account_id_bank_account_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_balance_snapshot" ADD CONSTRAINT "bank_balance_snapshot_bank_account_id_bank_account_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_transaction_account_external_unique" ON "bank_transaction" USING btree ("bank_account_id","external_id");--> statement-breakpoint
CREATE INDEX "bank_transaction_account_settled_idx" ON "bank_transaction" USING btree ("bank_account_id","settled_at");--> statement-breakpoint
CREATE INDEX "bank_balance_snapshot_account_captured_idx" ON "bank_balance_snapshot" USING btree ("bank_account_id","captured_at");