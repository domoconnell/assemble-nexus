CREATE TABLE "tenancy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"label" text,
	"starts_on" text NOT NULL,
	"ends_on" text,
	"invoice_day_of_month" integer DEFAULT 1 NOT NULL,
	"monthly_rate_cents" integer,
	"schedule_rule" jsonb,
	"per_session_rate_cents" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tenancy_invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"period_ym" text NOT NULL,
	"status" text DEFAULT 'issued' NOT NULL,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"vat_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "tenancy_invoice_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "tenancy_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"rate_cents_snapshot" integer,
	"cancelled_at" timestamp with time zone,
	"cancelled_reason" text,
	"invoice_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "room" ADD COLUMN "is_public" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tenancy" ADD CONSTRAINT "tenancy_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy" ADD CONSTRAINT "tenancy_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy" ADD CONSTRAINT "tenancy_room_id_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."room"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy_invoice" ADD CONSTRAINT "tenancy_invoice_tenancy_id_tenancy_id_fk" FOREIGN KEY ("tenancy_id") REFERENCES "public"."tenancy"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy_invoice" ADD CONSTRAINT "tenancy_invoice_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy_session" ADD CONSTRAINT "tenancy_session_tenancy_id_tenancy_id_fk" FOREIGN KEY ("tenancy_id") REFERENCES "public"."tenancy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tenancy_venue_status_idx" ON "tenancy" USING btree ("venue_id","status");--> statement-breakpoint
CREATE INDEX "tenancy_customer_idx" ON "tenancy" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "tenancy_room_idx" ON "tenancy" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "tenancy_invoice_tenancy_period_idx" ON "tenancy_invoice" USING btree ("tenancy_id","period_ym");--> statement-breakpoint
CREATE INDEX "tenancy_invoice_venue_status_idx" ON "tenancy_invoice" USING btree ("venue_id","status");--> statement-breakpoint
CREATE INDEX "tenancy_session_tenancy_idx" ON "tenancy_session" USING btree ("tenancy_id","starts_at");--> statement-breakpoint
CREATE INDEX "tenancy_session_window_idx" ON "tenancy_session" USING btree ("starts_at","ends_at");