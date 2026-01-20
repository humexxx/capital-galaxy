CREATE TYPE "public"."snapshot_source" AS ENUM('system_cron', 'system_approval', 'manual');--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_source_transaction_id_transactions_id_fk";
--> statement-breakpoint
ALTER TABLE "portfolio_snapshots" ADD COLUMN "source" "snapshot_source" DEFAULT 'system_cron' NOT NULL;