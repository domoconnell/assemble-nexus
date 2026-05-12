CREATE TABLE "booking_type" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"default_rate_modifier_x100" integer DEFAULT 10000 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "booking_type_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "pricing_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"room_id" uuid,
	"booking_type_id" uuid NOT NULL,
	"rate_kind" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"vat_rate_id" uuid,
	"vat_inclusive" boolean DEFAULT false NOT NULL,
	"min_hours" integer,
	"min_days" integer,
	"applies_from" timestamp with time zone,
	"applies_to" timestamp with time zone,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "deposit_policy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"deposit_pct_x100" integer NOT NULL,
	"non_refundable_pct_x100" integer NOT NULL,
	"refundable_until_days_before" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"applies_from" timestamp with time zone,
	"applies_to" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "booking_agreement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"title" text DEFAULT 'Booking Agreement' NOT NULL,
	"intro" text,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "customer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"organisation" text,
	"notes" text,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "booking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"vat_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"deposit_required_cents" integer DEFAULT 0 NOT NULL,
	"deposit_non_refundable_cents" integer DEFAULT 0 NOT NULL,
	"deposit_paid_cents" integer DEFAULT 0 NOT NULL,
	"balance_paid_cents" integer DEFAULT 0 NOT NULL,
	"deposit_policy_snapshot" jsonb,
	"agreement_snapshot" jsonb,
	"agreement_accepted_at" timestamp with time zone,
	"stripe_deposit_payment_intent_id" text,
	"customer_notes" text,
	"internal_notes" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "booking_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "booking_segment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"booking_type_id" uuid NOT NULL,
	"layout_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"rate_snapshot_kind" text NOT NULL,
	"rate_snapshot_amount_cents" integer NOT NULL,
	"units_x100" integer NOT NULL,
	"vat_rate_snapshot_x100" integer DEFAULT 0 NOT NULL,
	"vat_inclusive_snapshot" boolean DEFAULT false NOT NULL,
	"computed_subtotal_cents" integer DEFAULT 0 NOT NULL,
	"computed_vat_cents" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "booking_status_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"actor_user_id" uuid,
	"note" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pricing_rule" ADD CONSTRAINT "pricing_rule_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_rule" ADD CONSTRAINT "pricing_rule_room_id_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_rule" ADD CONSTRAINT "pricing_rule_booking_type_id_booking_type_id_fk" FOREIGN KEY ("booking_type_id") REFERENCES "public"."booking_type"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_rule" ADD CONSTRAINT "pricing_rule_vat_rate_id_vat_rate_id_fk" FOREIGN KEY ("vat_rate_id") REFERENCES "public"."vat_rate"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_policy" ADD CONSTRAINT "deposit_policy_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_agreement" ADD CONSTRAINT "booking_agreement_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_segment" ADD CONSTRAINT "booking_segment_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_segment" ADD CONSTRAINT "booking_segment_room_id_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."room"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_segment" ADD CONSTRAINT "booking_segment_booking_type_id_booking_type_id_fk" FOREIGN KEY ("booking_type_id") REFERENCES "public"."booking_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_segment" ADD CONSTRAINT "booking_segment_layout_id_capacity_layout_id_fk" FOREIGN KEY ("layout_id") REFERENCES "public"."capacity_layout"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_status_event" ADD CONSTRAINT "booking_status_event_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_status_event" ADD CONSTRAINT "booking_status_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pricing_rule_venue_room_type_idx" ON "pricing_rule" USING btree ("venue_id","room_id","booking_type_id");--> statement-breakpoint
CREATE INDEX "customer_email_idx" ON "customer" USING btree ("email");--> statement-breakpoint
CREATE INDEX "booking_venue_status_idx" ON "booking" USING btree ("venue_id","status");--> statement-breakpoint
CREATE INDEX "booking_customer_idx" ON "booking" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "booking_segment_room_window_idx" ON "booking_segment" USING btree ("room_id","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "booking_segment_booking_idx" ON "booking_segment" USING btree ("booking_id","sort_order");--> statement-breakpoint
CREATE INDEX "booking_status_event_booking_idx" ON "booking_status_event" USING btree ("booking_id","at");