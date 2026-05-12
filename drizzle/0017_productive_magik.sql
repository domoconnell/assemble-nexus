CREATE TABLE "event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"banner_file_id" uuid,
	"hero_file_id" uuid,
	"body_blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"extra_info_blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"doors_open_at" timestamp with time zone,
	"booking_id" uuid,
	"organiser_customer_id" uuid,
	"promoter_customer_id" uuid,
	"visibility" text DEFAULT 'private' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_ticketed" boolean DEFAULT false NOT NULL,
	"external_url" text,
	"commission_pct_x100" integer,
	"commission_flat_cents" integer,
	"sort_priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "event_room" (
	"event_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_room_event_id_room_id_pk" PRIMARY KEY("event_id","room_id")
);
--> statement-breakpoint
CREATE TABLE "event_faq" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ticket_type" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"vat_rate_id" uuid,
	"vat_inclusive" boolean DEFAULT false NOT NULL,
	"admits_count" integer DEFAULT 1 NOT NULL,
	"max_quantity" integer,
	"per_order_min" integer DEFAULT 0 NOT NULL,
	"per_order_max" integer,
	"sale_starts_at" timestamp with time zone,
	"sale_ends_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ticket_addon_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ticket_addon" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"group_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"vat_rate_id" uuid,
	"vat_inclusive" boolean DEFAULT false NOT NULL,
	"max_quantity_per_ticket" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ticket_type_addon" (
	"ticket_type_id" uuid NOT NULL,
	"addon_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_type_addon_ticket_type_id_addon_id_pk" PRIMARY KEY("ticket_type_id","addon_id")
);
--> statement-breakpoint
CREATE TABLE "ticket_bundle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"total_price_cents" integer NOT NULL,
	"vat_rate_id" uuid,
	"vat_inclusive" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ticket_bundle_item" (
	"bundle_id" uuid NOT NULL,
	"ticket_type_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_bundle_item_bundle_id_ticket_type_id_pk" PRIMARY KEY("bundle_id","ticket_type_id")
);
--> statement-breakpoint
CREATE TABLE "ticket_discount" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid,
	"label" text NOT NULL,
	"trigger" text DEFAULT 'auto' NOT NULL,
	"code" text,
	"kind" text NOT NULL,
	"value_x100" integer,
	"value_cents" integer,
	"n_free" integer,
	"min_qty" integer,
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ticket_discount_type" (
	"discount_id" uuid NOT NULL,
	"ticket_type_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_discount_type_discount_id_ticket_type_id_pk" PRIMARY KEY("discount_id","ticket_type_id")
);
--> statement-breakpoint
CREATE TABLE "ticket_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"event_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"vat_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"commission_cents" integer,
	"commission_pct_snapshot_x100" integer,
	"stripe_payment_intent_id" text,
	"stripe_charge_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "ticket_order_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "ticket_order_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_order_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"ticket_type_id" uuid,
	"addon_id" uuid,
	"bundle_id" uuid,
	"discount_id" uuid,
	"parent_line_id" uuid,
	"name_snapshot" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_cents" integer DEFAULT 0 NOT NULL,
	"vat_rate_x100_snapshot" integer DEFAULT 0 NOT NULL,
	"vat_inclusive_snapshot" boolean DEFAULT false NOT NULL,
	"vat_cents" integer DEFAULT 0 NOT NULL,
	"line_total_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_order_line_id" uuid NOT NULL,
	"code" text NOT NULL,
	"qr_file_id" uuid,
	"apple_pass_file_id" uuid,
	"holder_name" text,
	"status" text DEFAULT 'valid' NOT NULL,
	"used_at" timestamp with time zone,
	"used_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_banner_file_id_file_id_fk" FOREIGN KEY ("banner_file_id") REFERENCES "public"."file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_hero_file_id_file_id_fk" FOREIGN KEY ("hero_file_id") REFERENCES "public"."file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_organiser_customer_id_customer_id_fk" FOREIGN KEY ("organiser_customer_id") REFERENCES "public"."customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_promoter_customer_id_customer_id_fk" FOREIGN KEY ("promoter_customer_id") REFERENCES "public"."customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_room" ADD CONSTRAINT "event_room_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_room" ADD CONSTRAINT "event_room_room_id_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_faq" ADD CONSTRAINT "event_faq_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_type" ADD CONSTRAINT "ticket_type_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_type" ADD CONSTRAINT "ticket_type_vat_rate_id_vat_rate_id_fk" FOREIGN KEY ("vat_rate_id") REFERENCES "public"."vat_rate"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_addon_group" ADD CONSTRAINT "ticket_addon_group_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_addon" ADD CONSTRAINT "ticket_addon_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_addon" ADD CONSTRAINT "ticket_addon_group_id_ticket_addon_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."ticket_addon_group"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_addon" ADD CONSTRAINT "ticket_addon_vat_rate_id_vat_rate_id_fk" FOREIGN KEY ("vat_rate_id") REFERENCES "public"."vat_rate"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_type_addon" ADD CONSTRAINT "ticket_type_addon_ticket_type_id_ticket_type_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."ticket_type"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_type_addon" ADD CONSTRAINT "ticket_type_addon_addon_id_ticket_addon_id_fk" FOREIGN KEY ("addon_id") REFERENCES "public"."ticket_addon"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_bundle" ADD CONSTRAINT "ticket_bundle_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_bundle" ADD CONSTRAINT "ticket_bundle_vat_rate_id_vat_rate_id_fk" FOREIGN KEY ("vat_rate_id") REFERENCES "public"."vat_rate"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_bundle_item" ADD CONSTRAINT "ticket_bundle_item_bundle_id_ticket_bundle_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."ticket_bundle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_bundle_item" ADD CONSTRAINT "ticket_bundle_item_ticket_type_id_ticket_type_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."ticket_type"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_discount" ADD CONSTRAINT "ticket_discount_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_discount_type" ADD CONSTRAINT "ticket_discount_type_discount_id_ticket_discount_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."ticket_discount"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_discount_type" ADD CONSTRAINT "ticket_discount_type_ticket_type_id_ticket_type_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."ticket_type"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_order" ADD CONSTRAINT "ticket_order_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_order" ADD CONSTRAINT "ticket_order_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_order_line" ADD CONSTRAINT "ticket_order_line_ticket_order_id_ticket_order_id_fk" FOREIGN KEY ("ticket_order_id") REFERENCES "public"."ticket_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_order_line" ADD CONSTRAINT "ticket_order_line_ticket_type_id_ticket_type_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."ticket_type"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_order_line" ADD CONSTRAINT "ticket_order_line_addon_id_ticket_addon_id_fk" FOREIGN KEY ("addon_id") REFERENCES "public"."ticket_addon"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_order_line" ADD CONSTRAINT "ticket_order_line_bundle_id_ticket_bundle_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."ticket_bundle"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_order_line" ADD CONSTRAINT "ticket_order_line_discount_id_ticket_discount_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."ticket_discount"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_ticket_order_line_id_ticket_order_line_id_fk" FOREIGN KEY ("ticket_order_line_id") REFERENCES "public"."ticket_order_line"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_qr_file_id_file_id_fk" FOREIGN KEY ("qr_file_id") REFERENCES "public"."file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_apple_pass_file_id_file_id_fk" FOREIGN KEY ("apple_pass_file_id") REFERENCES "public"."file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_used_by_user_id_user_id_fk" FOREIGN KEY ("used_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_venue_slug_unique" ON "event" USING btree ("venue_id","slug");--> statement-breakpoint
CREATE INDEX "event_venue_status_idx" ON "event" USING btree ("venue_id","status","starts_at");--> statement-breakpoint
CREATE INDEX "event_booking_idx" ON "event" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "event_faq_event_idx" ON "event_faq" USING btree ("event_id","sort_order");--> statement-breakpoint
CREATE INDEX "ticket_type_event_idx" ON "ticket_type" USING btree ("event_id","sort_order");--> statement-breakpoint
CREATE INDEX "ticket_addon_group_event_idx" ON "ticket_addon_group" USING btree ("event_id","sort_order");--> statement-breakpoint
CREATE INDEX "ticket_addon_event_idx" ON "ticket_addon" USING btree ("event_id","sort_order");--> statement-breakpoint
CREATE INDEX "ticket_bundle_event_idx" ON "ticket_bundle" USING btree ("event_id","sort_order");--> statement-breakpoint
CREATE INDEX "ticket_discount_event_idx" ON "ticket_discount" USING btree ("event_id","sort_order");--> statement-breakpoint
CREATE INDEX "ticket_order_event_status_idx" ON "ticket_order" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "ticket_order_customer_idx" ON "ticket_order" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "ticket_order_line_order_idx" ON "ticket_order_line" USING btree ("ticket_order_id");--> statement-breakpoint
CREATE INDEX "ticket_code_idx" ON "ticket" USING btree ("code");--> statement-breakpoint
CREATE INDEX "ticket_order_line_idx" ON "ticket" USING btree ("ticket_order_line_id");