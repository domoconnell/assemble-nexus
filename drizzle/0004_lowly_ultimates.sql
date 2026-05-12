CREATE TABLE "capacity_layout" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "capacity_layout_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "room_capacity" (
	"room_id" uuid NOT NULL,
	"layout_id" uuid NOT NULL,
	"value" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_capacity_room_id_layout_id_pk" PRIMARY KEY("room_id","layout_id")
);
--> statement-breakpoint
DROP INDEX "room_content_block_room_idx";--> statement-breakpoint
ALTER TABLE "room_content_block" ADD COLUMN "section" text;--> statement-breakpoint
ALTER TABLE "room_content_block" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "room_capacity" ADD CONSTRAINT "room_capacity_room_id_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_capacity" ADD CONSTRAINT "room_capacity_layout_id_capacity_layout_id_fk" FOREIGN KEY ("layout_id") REFERENCES "public"."capacity_layout"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_content_block_room_idx" ON "room_content_block" USING btree ("room_id","section","category","sort_order");--> statement-breakpoint
ALTER TABLE "room" DROP COLUMN "capacity_seated";--> statement-breakpoint
ALTER TABLE "room" DROP COLUMN "capacity_standing";