CREATE TABLE "facility_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"icon" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "facility_category_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "facility_package" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"summary" text,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"vat_rate_id" uuid,
	"vat_inclusive" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "room_booking_type" (
	"room_id" uuid NOT NULL,
	"booking_type_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_booking_type_room_id_booking_type_id_pk" PRIMARY KEY("room_id","booking_type_id")
);
--> statement-breakpoint
CREATE TABLE "booking_facility_selection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"facility_package_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"name_snapshot" text NOT NULL,
	"price_snapshot_cents" integer NOT NULL,
	"vat_rate_snapshot_x100" integer DEFAULT 0 NOT NULL,
	"vat_inclusive_snapshot" boolean DEFAULT false NOT NULL,
	"computed_subtotal_cents" integer DEFAULT 0 NOT NULL,
	"computed_vat_cents" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "facility_package" ADD CONSTRAINT "facility_package_room_id_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_package" ADD CONSTRAINT "facility_package_category_id_facility_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."facility_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_package" ADD CONSTRAINT "facility_package_vat_rate_id_vat_rate_id_fk" FOREIGN KEY ("vat_rate_id") REFERENCES "public"."vat_rate"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_booking_type" ADD CONSTRAINT "room_booking_type_room_id_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_booking_type" ADD CONSTRAINT "room_booking_type_booking_type_id_booking_type_id_fk" FOREIGN KEY ("booking_type_id") REFERENCES "public"."booking_type"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_facility_selection" ADD CONSTRAINT "booking_facility_selection_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_facility_selection" ADD CONSTRAINT "booking_facility_selection_facility_package_id_facility_package_id_fk" FOREIGN KEY ("facility_package_id") REFERENCES "public"."facility_package"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "facility_package_room_idx" ON "facility_package" USING btree ("room_id","category_id","sort_order");--> statement-breakpoint
CREATE INDEX "booking_facility_selection_booking_idx" ON "booking_facility_selection" USING btree ("booking_id","sort_order");