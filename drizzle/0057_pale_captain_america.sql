CREATE TABLE "tenancy_invoice_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"tenancy_line_id" uuid,
	"description" text NOT NULL,
	"kind" text NOT NULL,
	"billing_mode" text,
	"quantity" integer,
	"unit_cents" integer,
	"amount_cents" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenancy_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text,
	"monthly_rate_cents" integer,
	"schedule_rule" jsonb,
	"billing_mode" text,
	"per_session_rate_cents" integer,
	"per_hour_rate_cents" integer,
	"fixed_monthly_rate_cents" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "tenancy" DROP CONSTRAINT "tenancy_room_id_room_id_fk";
--> statement-breakpoint
DROP INDEX "tenancy_room_idx";--> statement-breakpoint
ALTER TABLE "tenancy_session" ADD COLUMN "tenancy_line_id" uuid;--> statement-breakpoint
ALTER TABLE "tenancy_invoice_line" ADD CONSTRAINT "tenancy_invoice_line_invoice_id_tenancy_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."tenancy_invoice"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy_invoice_line" ADD CONSTRAINT "tenancy_invoice_line_tenancy_line_id_tenancy_line_id_fk" FOREIGN KEY ("tenancy_line_id") REFERENCES "public"."tenancy_line"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy_line" ADD CONSTRAINT "tenancy_line_tenancy_id_tenancy_id_fk" FOREIGN KEY ("tenancy_id") REFERENCES "public"."tenancy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy_line" ADD CONSTRAINT "tenancy_line_room_id_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."room"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tenancy_invoice_line_invoice_idx" ON "tenancy_invoice_line" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "tenancy_line_tenancy_idx" ON "tenancy_line" USING btree ("tenancy_id");--> statement-breakpoint
CREATE INDEX "tenancy_line_room_idx" ON "tenancy_line" USING btree ("room_id");--> statement-breakpoint
ALTER TABLE "tenancy_session" ADD CONSTRAINT "tenancy_session_tenancy_line_id_tenancy_line_id_fk" FOREIGN KEY ("tenancy_line_id") REFERENCES "public"."tenancy_line"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tenancy_session_line_idx" ON "tenancy_session" USING btree ("tenancy_line_id","starts_at");--> statement-breakpoint
ALTER TABLE "tenancy" DROP COLUMN "room_id";--> statement-breakpoint
ALTER TABLE "tenancy" DROP COLUMN "kind";--> statement-breakpoint
ALTER TABLE "tenancy" DROP COLUMN "monthly_rate_cents";--> statement-breakpoint
ALTER TABLE "tenancy" DROP COLUMN "schedule_rule";