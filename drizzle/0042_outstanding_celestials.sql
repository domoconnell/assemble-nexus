ALTER TABLE "room_blockout" ADD COLUMN "kind" text DEFAULT 'venue' NOT NULL;--> statement-breakpoint
ALTER TABLE "room_blockout" ADD COLUMN "recurrence_rule" jsonb;