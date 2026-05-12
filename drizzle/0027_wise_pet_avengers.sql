ALTER TABLE "room_blockout" ADD COLUMN "series_id" uuid;--> statement-breakpoint
CREATE INDEX "room_blockout_series_idx" ON "room_blockout" USING btree ("series_id");