CREATE TABLE "room_blockout_room" (
	"blockout_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	CONSTRAINT "room_blockout_room_blockout_id_room_id_pk" PRIMARY KEY("blockout_id","room_id")
);
--> statement-breakpoint
ALTER TABLE "room_blockout" DROP CONSTRAINT "room_blockout_room_id_room_id_fk";
--> statement-breakpoint
DROP INDEX "room_blockout_room_window_idx";--> statement-breakpoint
ALTER TABLE "room_blockout_room" ADD CONSTRAINT "room_blockout_room_blockout_id_room_blockout_id_fk" FOREIGN KEY ("blockout_id") REFERENCES "public"."room_blockout"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_blockout_room" ADD CONSTRAINT "room_blockout_room_room_id_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_blockout_room_room_idx" ON "room_blockout_room" USING btree ("room_id");--> statement-breakpoint
ALTER TABLE "room_blockout" DROP COLUMN "room_id";