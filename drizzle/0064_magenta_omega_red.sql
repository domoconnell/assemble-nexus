CREATE TABLE "manual_invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"organisation_id" uuid,
	"customer_name" text,
	"customer_email" text,
	"customer_address_lines" jsonb,
	"customer_vat_number" text,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"vat_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"description" text,
	"notes" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "manual_invoice_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "manual_invoice_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "manual_invoice" ADD CONSTRAINT "manual_invoice_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_invoice_line" ADD CONSTRAINT "manual_invoice_line_invoice_id_manual_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."manual_invoice"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "manual_invoice_venue_idx" ON "manual_invoice" USING btree ("venue_id","issued_at");--> statement-breakpoint
CREATE INDEX "manual_invoice_organisation_idx" ON "manual_invoice" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "manual_invoice_line_invoice_idx" ON "manual_invoice_line" USING btree ("invoice_id");