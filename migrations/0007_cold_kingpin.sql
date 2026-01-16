ALTER TYPE "public"."transaction_status" ADD VALUE 'closed';--> statement-breakpoint
CREATE TABLE "app_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text,
	"error" text,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "portfolio_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"total_value" numeric(20, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "idx_snapshots_lookup" ON "portfolio_snapshots" ("portfolio_id", "date" DESC);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "initial_value" numeric(20, 2);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "current_value" numeric(20, 2);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "source_transaction_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "withdrawal_transaction_ids" text[];--> statement-breakpoint
CREATE INDEX "idx_transactions_active" ON "transactions" ("portfolio_id", "status", "type", "current_value") WHERE "status" = 'approved';
--> statement-breakpoint
ALTER TABLE "portfolio_snapshots" ADD CONSTRAINT "portfolio_snapshots_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_source_transaction_id_transactions_id_fk" FOREIGN KEY ("source_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;