CREATE TABLE "discount" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"percent_x100" integer NOT NULL,
	"applies_to" text DEFAULT 'room_hire' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "discount_id" uuid;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "discount_label_snapshot" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "discount_percent_x100_snapshot" integer;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "discount_amount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discount" ADD CONSTRAINT "discount_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discount_venue_active_idx" ON "discount" USING btree ("venue_id","is_active");