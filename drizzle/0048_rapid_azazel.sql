ALTER TABLE "fake_dd_session" RENAME COLUMN "tenancy_id" TO "organisation_id";--> statement-breakpoint
ALTER TABLE "fake_dd_session" DROP CONSTRAINT "fake_dd_session_tenancy_id_tenancy_id_fk";
--> statement-breakpoint
DROP INDEX "fake_dd_session_tenancy_idx";--> statement-breakpoint
ALTER TABLE "fake_dd_session" ADD CONSTRAINT "fake_dd_session_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fake_dd_session_organisation_idx" ON "fake_dd_session" USING btree ("organisation_id");