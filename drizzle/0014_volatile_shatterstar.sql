CREATE TABLE "facility_package_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "facility_package" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "facility_package_group" ADD CONSTRAINT "facility_package_group_room_id_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "facility_package_group_room_idx" ON "facility_package_group" USING btree ("room_id","sort_order");--> statement-breakpoint
ALTER TABLE "facility_package" ADD CONSTRAINT "facility_package_group_id_facility_package_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."facility_package_group"("id") ON DELETE set null ON UPDATE no action;