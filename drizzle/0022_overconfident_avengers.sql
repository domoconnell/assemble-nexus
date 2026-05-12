ALTER TABLE "event" ADD COLUMN "checkin_code" text;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_checkin_code_unique" UNIQUE("checkin_code");