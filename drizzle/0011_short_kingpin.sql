CREATE TABLE "setting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "room" ADD COLUMN "allow_ticketed_events" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "room" ADD COLUMN "ticketing_setup_fee_pct_x100" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "ticketing_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "ticketing_setup_fee_pct_x100_snapshot" integer;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "ticketing_setup_fee_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "setting" ADD CONSTRAINT "setting_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "setting_venue_key_unique" ON "setting" USING btree ("venue_id","key");