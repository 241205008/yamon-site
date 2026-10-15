CREATE TYPE "public"."audit_action" AS ENUM('role_changed', 'disabled', 'enabled', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."category" AS ENUM('インセクター', 'ママル', 'アクア', 'バーダー');--> statement-breakpoint
CREATE TYPE "public"."location_type" AS ENUM('main', 'other', 'none');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'officer', 'member', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'disabled', 'withdrawn');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"target_user_id" uuid NOT NULL,
	"action" "audit_action" NOT NULL,
	"from_role" "role",
	"to_role" "role",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_logs_role_change" CHECK (("audit_logs"."action" = 'role_changed') = ("audit_logs"."from_role" is not null and "audit_logs"."to_role" is not null))
);
--> statement-breakpoint
CREATE TABLE "creatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" "category" NOT NULL,
	"memo" text DEFAULT '' NOT NULL,
	"location_protected" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"main_location_id" uuid,
	"location_name" text DEFAULT '' NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"date" date NOT NULL,
	"time" time(0) NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_coordinates_pair" CHECK (("events"."lat" is null) = ("events"."lng" is null))
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"email" text NOT NULL,
	"role" "role" DEFAULT 'member' NOT NULL,
	"invited_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "main_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observation_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creature_id" uuid NOT NULL,
	"event_id" uuid,
	"location_type" "location_type" NOT NULL,
	"main_location_id" uuid,
	"location_name" text DEFAULT '' NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"date" date NOT NULL,
	"time" time(0) NOT NULL,
	"memo" text DEFAULT '' NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "observation_records_coordinates_pair" CHECK (("observation_records"."lat" is null) = ("observation_records"."lng" is null)),
	CONSTRAINT "observation_records_main_location" CHECK (("observation_records"."location_type" = 'main') = ("observation_records"."main_location_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"password_hash" text,
	"role" "role" DEFAULT 'member' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	CONSTRAINT "users_withdrawn_anonymized" CHECK (("users"."status" = 'withdrawn' and "users"."email" is null and "users"."password_hash" is null and "users"."withdrawn_at" is not null)
        or ("users"."status" <> 'withdrawn' and "users"."email" is not null and "users"."password_hash" is not null and "users"."withdrawn_at" is null))
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creatures" ADD CONSTRAINT "creatures_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_main_location_id_main_locations_id_fk" FOREIGN KEY ("main_location_id") REFERENCES "public"."main_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_records" ADD CONSTRAINT "observation_records_creature_id_creatures_id_fk" FOREIGN KEY ("creature_id") REFERENCES "public"."creatures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_records" ADD CONSTRAINT "observation_records_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_records" ADD CONSTRAINT "observation_records_main_location_id_main_locations_id_fk" FOREIGN KEY ("main_location_id") REFERENCES "public"."main_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_records" ADD CONSTRAINT "observation_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "events_date_idx" ON "events" USING btree ("date");--> statement-breakpoint
CREATE INDEX "invitations_email_idx" ON "invitations" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "observation_records_date_idx" ON "observation_records" USING btree ("date" DESC NULLS LAST,"time" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "observation_records_event_id_idx" ON "observation_records" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "observation_records_creature_id_idx" ON "observation_records" USING btree ("creature_id");--> statement-breakpoint
CREATE INDEX "observation_records_main_location_id_idx" ON "observation_records" USING btree ("main_location_id");--> statement-breakpoint
CREATE INDEX "observation_records_user_id_idx" ON "observation_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));