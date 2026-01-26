-- Safe additive migration for production schema reconciliation
-- This migration uses IF NOT EXISTS / IF EXISTS patterns to safely add
-- any missing columns, tables, or indexes without failing if they already exist.
-- 
-- Addresses Railway production errors:
-- - "column tenant_id does not exist" for notifications
-- - "relation notification_preferences does not exist"
-- - "column chat_retention_days does not exist"

--> statement-breakpoint
-- 1. Ensure notification_preferences table exists
CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar,
  "user_id" varchar NOT NULL,
  "task_deadline" boolean DEFAULT true NOT NULL,
  "task_assigned" boolean DEFAULT true NOT NULL,
  "task_completed" boolean DEFAULT true NOT NULL,
  "comment_added" boolean DEFAULT true NOT NULL,
  "comment_mention" boolean DEFAULT true NOT NULL,
  "project_update" boolean DEFAULT true NOT NULL,
  "project_member_added" boolean DEFAULT true NOT NULL,
  "task_status_changed" boolean DEFAULT false NOT NULL,
  "email_enabled" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

--> statement-breakpoint
-- 2. Ensure notifications table exists
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar,
  "user_id" varchar NOT NULL,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "message" text,
  "payload_json" jsonb,
  "read_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

--> statement-breakpoint
-- 3. Add tenant_id to notifications if missing (nullable for backward compatibility)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'notifications' 
      AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE "notifications" ADD COLUMN "tenant_id" varchar;
  END IF;
END $$;

--> statement-breakpoint
-- 4. Add tenant_id to notification_preferences if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'notification_preferences' 
      AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE "notification_preferences" ADD COLUMN "tenant_id" varchar;
  END IF;
END $$;

--> statement-breakpoint
-- 5. Add chat_retention_days to tenant_settings if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'tenant_settings' 
      AND column_name = 'chat_retention_days'
  ) THEN
    ALTER TABLE "tenant_settings" ADD COLUMN "chat_retention_days" integer;
  END IF;
END $$;

--> statement-breakpoint
-- 6. Add chat_retention_days to system_settings if missing (platform default)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'system_settings' 
      AND column_name = 'chat_retention_days'
  ) THEN
    ALTER TABLE "system_settings" ADD COLUMN "chat_retention_days" integer DEFAULT 365;
  END IF;
END $$;

--> statement-breakpoint
-- 7. Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS "notifications_user_idx" ON "notifications" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_tenant_idx" ON "notifications" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_created_idx" ON "notifications" USING btree ("created_at");

--> statement-breakpoint
-- 8. Create unique index on notification_preferences if not exists
-- Using a DO block since CREATE UNIQUE INDEX IF NOT EXISTS may not work on all PG versions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND tablename = 'notification_preferences' 
      AND indexname = 'notification_preferences_user_idx'
  ) THEN
    CREATE UNIQUE INDEX "notification_preferences_user_idx" ON "notification_preferences" USING btree ("user_id");
  END IF;
END $$;

--> statement-breakpoint
-- 9. Add foreign key constraints if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'notifications_tenant_id_tenants_id_fk'
  ) THEN
    BEGIN
      ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" 
        FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'notifications_user_id_users_id_fk'
  ) THEN
    BEGIN
      ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" 
        FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'notification_preferences_tenant_id_tenants_id_fk'
  ) THEN
    BEGIN
      ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_tenant_id_tenants_id_fk" 
        FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'notification_preferences_user_id_users_id_fk'
  ) THEN
    BEGIN
      ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" 
        FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

--> statement-breakpoint
-- 10. Backfill tenant_id in notifications from user's tenant (high-confidence derivation)
UPDATE "notifications" n
SET "tenant_id" = u."tenant_id"
FROM "users" u
WHERE n."user_id" = u."id"
  AND n."tenant_id" IS NULL
  AND u."tenant_id" IS NOT NULL;

--> statement-breakpoint
-- 11. Backfill tenant_id in notification_preferences from user's tenant
UPDATE "notification_preferences" np
SET "tenant_id" = u."tenant_id"
FROM "users" u
WHERE np."user_id" = u."id"
  AND np."tenant_id" IS NULL
  AND u."tenant_id" IS NOT NULL;
