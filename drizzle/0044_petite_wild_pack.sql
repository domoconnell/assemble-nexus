CREATE TABLE "tenancy_agreement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"html" text NOT NULL,
	"token" text NOT NULL,
	"sent_at" timestamp with time zone,
	"signed_at" timestamp with time zone,
	"signed_by_name" text,
	"signed_by_ip" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "tenancy" ADD COLUMN "dd_token" text;--> statement-breakpoint
ALTER TABLE "tenancy_agreement" ADD CONSTRAINT "tenancy_agreement_tenancy_id_tenancy_id_fk" FOREIGN KEY ("tenancy_id") REFERENCES "public"."tenancy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tenancy_agreement_tenancy_status_idx" ON "tenancy_agreement" USING btree ("tenancy_id","status");--> statement-breakpoint
CREATE INDEX "tenancy_agreement_token_unique_idx" ON "tenancy_agreement" USING btree ("token");--> statement-breakpoint
CREATE INDEX "tenancy_dd_token_idx" ON "tenancy" USING btree ("dd_token");