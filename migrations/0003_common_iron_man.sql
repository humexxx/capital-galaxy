ALTER TABLE "investment_methods" ALTER COLUMN "risk_level" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."risk_level";--> statement-breakpoint
CREATE TYPE "public"."risk_level" AS ENUM('Low', 'Medium', 'High');--> statement-breakpoint
ALTER TABLE "investment_methods" ALTER COLUMN "risk_level" SET DATA TYPE "public"."risk_level" USING "risk_level"::"public"."risk_level";