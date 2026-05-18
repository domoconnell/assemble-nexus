CREATE TABLE "recurring_cost_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"type" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "recurring_cost_schedule" ADD COLUMN "item_id" uuid;--> statement-breakpoint
ALTER TABLE "recurring_cost_item" ADD CONSTRAINT "recurring_cost_item_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_cost_item_venue_type_idx" ON "recurring_cost_item" USING btree ("venue_id","type");--> statement-breakpoint
ALTER TABLE "recurring_cost_schedule" ADD CONSTRAINT "recurring_cost_schedule_item_id_recurring_cost_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."recurring_cost_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_cost_schedule_item_from_idx" ON "recurring_cost_schedule" USING btree ("item_id","effective_from");