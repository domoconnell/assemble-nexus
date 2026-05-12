CREATE TABLE "room_blockout" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"room_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"notes" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "recurrence_rule" jsonb;--> statement-breakpoint
ALTER TABLE "room_blockout" ADD CONSTRAINT "room_blockout_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_blockout" ADD CONSTRAINT "room_blockout_room_id_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_blockout" ADD CONSTRAINT "room_blockout_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_blockout_room_window_idx" ON "room_blockout" USING btree ("room_id","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "room_blockout_venue_window_idx" ON "room_blockout" USING btree ("venue_id","starts_at","ends_at");