ALTER TABLE "portfolio_snapshots" ALTER COLUMN "source" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "portfolio_snapshots" ALTER COLUMN "source" SET DEFAULT 'system_cron'::text;--> statement-breakpoint
DROP TYPE "public"."snapshot_source";--> statement-breakpoint
CREATE TYPE "public"."snapshot_source" AS ENUM('system_cron', 'admin_approval', 'manual', 'admin_enforce');--> statement-breakpoint
ALTER TABLE "portfolio_snapshots" ALTER COLUMN "source" SET DEFAULT 'system_cron'::"public"."snapshot_source";--> statement-breakpoint
ALTER TABLE "portfolio_snapshots" ALTER COLUMN "source" SET DATA TYPE "public"."snapshot_source" USING "source"::"public"."snapshot_source";