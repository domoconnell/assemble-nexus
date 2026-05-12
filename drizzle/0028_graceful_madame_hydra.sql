CREATE TABLE "organisation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"notes" text,
	"primary_contact_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"email" text,
	"phone" text,
	"notes" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "organisation_contact" (
	"organisation_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"role" text DEFAULT 'other' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organisation_contact_organisation_id_contact_id_pk" PRIMARY KEY("organisation_id","contact_id")
);
--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "organisation_id" uuid;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "organiser_organisation_id" uuid;--> statement-breakpoint
ALTER TABLE "ticket_order" ADD COLUMN "organisation_id" uuid;--> statement-breakpoint
ALTER TABLE "expense" ADD COLUMN "organisation_id" uuid;--> statement-breakpoint
ALTER TABLE "organisation" ADD CONSTRAINT "organisation_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisation_contact" ADD CONSTRAINT "organisation_contact_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisation_contact" ADD CONSTRAINT "organisation_contact_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organisation_venue_idx" ON "organisation" USING btree ("venue_id","name");--> statement-breakpoint
CREATE INDEX "contact_venue_email_idx" ON "contact" USING btree ("venue_id","email");--> statement-breakpoint
CREATE INDEX "organisation_contact_contact_idx" ON "organisation_contact" USING btree ("contact_id");