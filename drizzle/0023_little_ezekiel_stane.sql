CREATE TABLE "recurring_cost_schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"type" text NOT NULL,
	"effective_from" date NOT NULL,
	"monthly_amount_cents" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"is_cost_of_delivery" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "expense" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"expense_category_id" uuid,
	"date" date NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"supplier_name" text,
	"attachment_file_id" uuid,
	"linked_event_id" uuid,
	"linked_booking_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pos_daily_takings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"date" date NOT NULL,
	"gross_cents" integer DEFAULT 0 NOT NULL,
	"net_cents" integer DEFAULT 0 NOT NULL,
	"vat_cents" integer DEFAULT 0 NOT NULL,
	"cogs_cents" integer DEFAULT 0 NOT NULL,
	"transactions_count" integer DEFAULT 0 NOT NULL,
	"category_breakdown" jsonb,
	"source" text NOT NULL,
	"external_ref" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manual_income" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"date" date NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"notes" text,
	"attachment_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "recurring_cost_schedule" ADD CONSTRAINT "recurring_cost_schedule_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_category" ADD CONSTRAINT "expense_category_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_expense_category_id_expense_category_id_fk" FOREIGN KEY ("expense_category_id") REFERENCES "public"."expense_category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_attachment_file_id_file_id_fk" FOREIGN KEY ("attachment_file_id") REFERENCES "public"."file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_linked_event_id_event_id_fk" FOREIGN KEY ("linked_event_id") REFERENCES "public"."event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_linked_booking_id_booking_id_fk" FOREIGN KEY ("linked_booking_id") REFERENCES "public"."booking"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_daily_takings" ADD CONSTRAINT "pos_daily_takings_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_income" ADD CONSTRAINT "manual_income_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_income" ADD CONSTRAINT "manual_income_attachment_file_id_file_id_fk" FOREIGN KEY ("attachment_file_id") REFERENCES "public"."file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_cost_schedule_venue_type_from_idx" ON "recurring_cost_schedule" USING btree ("venue_id","type","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "expense_category_venue_key_unique" ON "expense_category" USING btree ("venue_id","key");--> statement-breakpoint
CREATE INDEX "expense_category_venue_idx" ON "expense_category" USING btree ("venue_id","sort_order");--> statement-breakpoint
CREATE INDEX "expense_venue_date_idx" ON "expense" USING btree ("venue_id","date");--> statement-breakpoint
CREATE INDEX "expense_category_idx" ON "expense" USING btree ("expense_category_id");--> statement-breakpoint
CREATE INDEX "expense_linked_event_idx" ON "expense" USING btree ("linked_event_id");--> statement-breakpoint
CREATE INDEX "expense_linked_booking_idx" ON "expense" USING btree ("linked_booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pos_daily_takings_venue_date_unique" ON "pos_daily_takings" USING btree ("venue_id","date");--> statement-breakpoint
CREATE INDEX "pos_daily_takings_venue_idx" ON "pos_daily_takings" USING btree ("venue_id","date");--> statement-breakpoint
CREATE INDEX "manual_income_venue_date_idx" ON "manual_income" USING btree ("venue_id","date");