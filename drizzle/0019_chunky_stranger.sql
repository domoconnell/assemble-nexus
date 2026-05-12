CREATE TABLE "event_organiser" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"email_domain" text,
	"contact_email" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_event_organiser" (
	"user_id" uuid NOT NULL,
	"event_organiser_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_event_organiser_user_id_event_organiser_id_pk" PRIMARY KEY("user_id","event_organiser_id")
);
--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "event_organiser_id" uuid;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "fee_pass_through" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "event_organiser" ADD CONSTRAINT "event_organiser_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_event_organiser" ADD CONSTRAINT "user_event_organiser_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_event_organiser" ADD CONSTRAINT "user_event_organiser_event_organiser_id_event_organiser_id_fk" FOREIGN KEY ("event_organiser_id") REFERENCES "public"."event_organiser"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_organiser_venue_slug_unique" ON "event_organiser" USING btree ("venue_id","slug");--> statement-breakpoint
CREATE INDEX "event_organiser_email_domain_idx" ON "event_organiser" USING btree ("venue_id","email_domain");--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_event_organiser_id_event_organiser_id_fk" FOREIGN KEY ("event_organiser_id") REFERENCES "public"."event_organiser"("id") ON DELETE set null ON UPDATE no action;