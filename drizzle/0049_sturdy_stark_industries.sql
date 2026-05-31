DROP INDEX "tenancy_dd_token_idx";--> statement-breakpoint
ALTER TABLE "tenancy" DROP COLUMN "dd_token";--> statement-breakpoint
ALTER TABLE "tenancy" DROP COLUMN "stripe_customer_id";--> statement-breakpoint
ALTER TABLE "tenancy" DROP COLUMN "direct_debit_mandate_id";--> statement-breakpoint
ALTER TABLE "tenancy" DROP COLUMN "direct_debit_ready_at";