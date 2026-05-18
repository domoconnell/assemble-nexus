CREATE TABLE "fake_dd_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"success_url" text NOT NULL,
	"cancel_url" text NOT NULL,
	"account_name" text,
	"account_last4" text,
	"sort_code" text,
	"customer_id" text,
	"payment_method_id" text,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fake_dd_session_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
ALTER TABLE "fake_dd_session" ADD CONSTRAINT "fake_dd_session_tenancy_id_tenancy_id_fk" FOREIGN KEY ("tenancy_id") REFERENCES "public"."tenancy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fake_dd_session_tenancy_idx" ON "fake_dd_session" USING btree ("tenancy_id");--> statement-breakpoint
CREATE INDEX "fake_dd_session_status_idx" ON "fake_dd_session" USING btree ("status");