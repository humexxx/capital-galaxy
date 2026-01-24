CREATE TYPE "public"."road_path_frequency" AS ENUM('daily', 'every_other_day', 'weekly', 'biweekly', 'monthly');--> statement-breakpoint
CREATE TABLE "board_columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"order" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "board_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"column_id" uuid NOT NULL,
	"road_path_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"order" real NOT NULL,
	"due_date" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "road_path_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"road_path_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"target_value" numeric(20, 2),
	"order" real NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "road_path_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"road_path_id" uuid NOT NULL,
	"value" numeric(20, 2) NOT NULL,
	"notes" text,
	"date" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "road_paths" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"target_value" numeric(20, 2),
	"current_value" numeric(20, 2) DEFAULT '0',
	"unit" text,
	"start_date" timestamp with time zone NOT NULL,
	"target_date" timestamp with time zone,
	"auto_create_tasks" real DEFAULT 0 NOT NULL,
	"task_frequency" "road_path_frequency",
	"last_task_created_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "board_columns" ADD CONSTRAINT "board_columns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_tasks" ADD CONSTRAINT "board_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_tasks" ADD CONSTRAINT "board_tasks_column_id_board_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."board_columns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_tasks" ADD CONSTRAINT "board_tasks_road_path_id_road_paths_id_fk" FOREIGN KEY ("road_path_id") REFERENCES "public"."road_paths"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "road_path_milestones" ADD CONSTRAINT "road_path_milestones_road_path_id_road_paths_id_fk" FOREIGN KEY ("road_path_id") REFERENCES "public"."road_paths"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "road_path_progress" ADD CONSTRAINT "road_path_progress_road_path_id_road_paths_id_fk" FOREIGN KEY ("road_path_id") REFERENCES "public"."road_paths"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "road_paths" ADD CONSTRAINT "road_paths_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;