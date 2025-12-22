CREATE TYPE "public"."risk_level" AS ENUM('Bajo', 'Medio', 'Alto');--> statement-breakpoint
CREATE TABLE "investment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"author" text NOT NULL,
	"risk_level" "risk_level" NOT NULL,
	"monthly_roi" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
