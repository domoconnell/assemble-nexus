DROP INDEX "facility_package_group_room_idx";--> statement-breakpoint
ALTER TABLE "facility_package_group" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "facility_package_group" ADD CONSTRAINT "facility_package_group_category_id_facility_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."facility_category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "facility_package_group_room_idx" ON "facility_package_group" USING btree ("room_id","category_id","sort_order");