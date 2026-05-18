ALTER TABLE "tenancy" DROP CONSTRAINT "tenancy_customer_id_customer_id_fk";
--> statement-breakpoint
DROP INDEX "tenancy_customer_idx";--> statement-breakpoint
ALTER TABLE "tenancy" ALTER COLUMN "customer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tenancy" ADD COLUMN "organisation_id" uuid;--> statement-breakpoint
ALTER TABLE "tenancy" ADD COLUMN "contact_id" uuid;--> statement-breakpoint
ALTER TABLE "tenancy" ADD COLUMN "agreement_html" text;--> statement-breakpoint
ALTER TABLE "tenancy" ADD COLUMN "agreement_token" text;--> statement-breakpoint
ALTER TABLE "tenancy" ADD COLUMN "agreement_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenancy" ADD COLUMN "agreement_signed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenancy" ADD COLUMN "agreement_signed_by_name" text;--> statement-breakpoint
ALTER TABLE "tenancy" ADD COLUMN "agreement_signed_by_ip" text;--> statement-breakpoint
ALTER TABLE "tenancy" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "tenancy" ADD COLUMN "direct_debit_mandate_id" text;--> statement-breakpoint
ALTER TABLE "tenancy" ADD COLUMN "direct_debit_ready_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenancy" ADD CONSTRAINT "tenancy_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy" ADD CONSTRAINT "tenancy_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy" ADD CONSTRAINT "tenancy_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tenancy_organisation_idx" ON "tenancy" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "tenancy_agreement_token_idx" ON "tenancy" USING btree ("agreement_token");