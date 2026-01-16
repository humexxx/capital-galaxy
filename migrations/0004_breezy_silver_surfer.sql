CREATE TYPE "public"."transaction_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('buy', 'withdrawal');--> statement-breakpoint
CREATE TABLE "portfolios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text DEFAULT 'My Main Portfolio' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "portfolios_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"investment_method_id" uuid NOT NULL,
	"type" "transaction_type" NOT NULL,
	"amount" numeric(20, 2) NOT NULL,
	"fee" numeric(20, 2) DEFAULT '0' NOT NULL,
	"total" numeric(20, 2) NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"notes" text,
	"status" "transaction_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_investment_method_id_investment_methods_id_fk" FOREIGN KEY ("investment_method_id") REFERENCES "public"."investment_methods"("id") ON DELETE restrict ON UPDATE no action;