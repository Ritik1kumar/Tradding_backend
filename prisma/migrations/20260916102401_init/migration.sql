-- CreateEnum
CREATE TYPE "role_type" AS ENUM ('buyer', 'seller', 'broker', 'admin');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('active', 'suspended', 'deactivated');

-- CreateEnum
CREATE TYPE "invite_status" AS ENUM ('pending', 'accepted', 'revoked');

-- CreateEnum
CREATE TYPE "listing_side" AS ENUM ('SELL', 'BUY');

-- CreateEnum
CREATE TYPE "listing_status" AS ENUM ('active', 'price_expired', 'na', 'sold_out', 'traded', 'withdrawn');

-- CreateEnum
CREATE TYPE "negotiation_status" AS ENUM ('open', 'closed', 'declined', 'expired');

-- CreateEnum
CREATE TYPE "offer_type" AS ENUM ('offer', 'counter', 'accept', 'decline', 'retract');

-- CreateEnum
CREATE TYPE "offer_status" AS ENUM ('pending', 'accepted', 'declined', 'countered', 'retracted', 'expired', 'auto_closed_price_drop', 'sold_out', 'back_in_stock');

-- CreateEnum
CREATE TYPE "trade_status" AS ENUM ('confirmed', 'cancelled');

-- CreateEnum
CREATE TYPE "origin_level" AS ENUM ('STATE', 'CITY');

-- CreateEnum
CREATE TYPE "freight_status" AS ENUM ('active', 'price_expired');

-- CreateEnum
CREATE TYPE "source_kind" AS ENUM ('supplier', 'freight');

-- CreateTable
CREATE TABLE "tos_version" (
    "version" INTEGER NOT NULL,
    "effective_date" DATE NOT NULL,
    "terms_url" TEXT NOT NULL,
    "privacy_url" TEXT NOT NULL,
    "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tos_version_pkey" PRIMARY KEY ("version")
);

-- CreateTable
CREATE TABLE "app_user" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "firm_name" TEXT,
    "roles" "role_type"[] DEFAULT ARRAY[]::"role_type"[],
    "city" TEXT,
    "default_payment_terms" TEXT,
    "firm_notes" TEXT,
    "default_weight_kg" INTEGER,
    "tos_accepted_version" INTEGER,
    "tos_accepted_at" TIMESTAMPTZ(6),
    "invited_by" UUID,
    "status" "user_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invite" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "phone" TEXT NOT NULL,
    "invited_by" UUID NOT NULL,
    "role_hint" "role_type",
    "status" "invite_status" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_verification" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "otp_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commodity_category" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commodity_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commodity" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commodity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "side" "listing_side" NOT NULL,
    "user_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "commodity_id" UUID,
    "item_name" TEXT NOT NULL,
    "quality" TEXT,
    "quantity_bags" INTEGER NOT NULL,
    "availability_bags" INTEGER NOT NULL,
    "weight_kg" INTEGER,
    "price" DECIMAL(12,2),
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "photo_url" TEXT,
    "moisture" TEXT,
    "color" TEXT,
    "size" TEXT,
    "payment_terms" TEXT,
    "notes" TEXT,
    "status" "listing_status" NOT NULL DEFAULT 'active',
    "price_valid_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "negotiation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "listing_id" UUID NOT NULL,
    "buyer_id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "status" "negotiation_status" NOT NULL DEFAULT 'open',
    "buyer_counters_used" INTEGER NOT NULL DEFAULT 0,
    "seller_counters_used" INTEGER NOT NULL DEFAULT 0,
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "negotiation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "negotiation_id" UUID NOT NULL,
    "by_user_id" UUID NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "bags_requested" INTEGER NOT NULL,
    "type" "offer_type" NOT NULL,
    "status" "offer_status" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buyer_requirement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "buyer_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "item_name" TEXT NOT NULL,
    "weight_per_bag_kg" INTEGER,
    "target_price" DECIMAL(12,2),
    "quantity_bags" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "buyer_requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recently_viewed_listing" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "buyer_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "viewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "view_count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "recently_viewed_listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broker" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "broker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "negotiation_id" UUID NOT NULL,
    "buyer_id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "commodity_id" UUID,
    "quality" TEXT,
    "final_price" DECIMAL(12,2) NOT NULL,
    "quantity_bags" INTEGER NOT NULL,
    "broker_id" UUID,
    "broker_name_freetext" TEXT,
    "is_self" BOOLEAN NOT NULL DEFAULT false,
    "status" "trade_status" NOT NULL DEFAULT 'confirmed',
    "confirmed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deal_msg_sent_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_by_admin" UUID,

    CONSTRAINT "trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "freight_route" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "origin_level" "origin_level" NOT NULL,
    "origin_name" TEXT NOT NULL,
    "destination_name" TEXT NOT NULL,
    "price_low" DECIMAL(12,2),
    "price_high" DECIMAL(12,2),
    "unit" TEXT NOT NULL DEFAULT 'per_quintal',
    "truck_capacity" TEXT,
    "price_valid_until" TIMESTAMPTZ(6),
    "status" "freight_status" NOT NULL DEFAULT 'active',
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "freight_route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_user_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_template" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_kind" "source_kind" NOT NULL,
    "owner_user_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "column_map" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_template_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_user_phone_key" ON "app_user"("phone");

-- CreateIndex
CREATE INDEX "ix_otp_verification_user" ON "otp_verification"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ix_otp_verification_expires" ON "otp_verification"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "commodity_category_name_key" ON "commodity_category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "uq_commodity_category_id_name" ON "commodity"("category_id", "name");

-- CreateIndex
CREATE INDEX "ix_listing_browse" ON "listing"("side", "category_id", "status", "price");

-- CreateIndex
CREATE INDEX "ix_listing_by_user" ON "listing"("user_id", "status");

-- CreateIndex
CREATE INDEX "ix_neg_by_buyer" ON "negotiation"("buyer_id", "status");

-- CreateIndex
CREATE INDEX "ix_neg_by_seller" ON "negotiation"("seller_id", "status");

-- CreateIndex
CREATE INDEX "ix_neg_listing" ON "negotiation"("listing_id");

-- CreateIndex
CREATE INDEX "ix_offer_neg" ON "offer"("negotiation_id", "created_at");

-- CreateIndex
CREATE INDEX "ix_buyer_requirement_category" ON "buyer_requirement"("category_id");

-- CreateIndex
CREATE INDEX "ix_buyer_requirement_buyer" ON "buyer_requirement"("buyer_id", "created_at");

-- CreateIndex
CREATE INDEX "ix_recently_viewed_listing_buyer" ON "recently_viewed_listing"("buyer_id", "viewed_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_recently_viewed_listing" ON "recently_viewed_listing"("buyer_id", "listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "trade_negotiation_id_key" ON "trade"("negotiation_id");

-- CreateIndex
CREATE INDEX "ix_trade_buyer" ON "trade"("buyer_id", "confirmed_at");

-- CreateIndex
CREATE INDEX "ix_trade_seller" ON "trade"("seller_id", "confirmed_at");

-- CreateIndex
CREATE INDEX "ix_trade_broker" ON "trade"("broker_id");

-- CreateIndex
CREATE INDEX "ix_freight_route" ON "freight_route"("origin_name", "destination_name", "status");

-- CreateIndex
CREATE INDEX "ix_audit_entity" ON "audit_log"("entity", "entity_id", "created_at");

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_tos_accepted_version_fkey" FOREIGN KEY ("tos_accepted_version") REFERENCES "tos_version"("version") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite" ADD CONSTRAINT "invite_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_verification" ADD CONSTRAINT "otp_verification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commodity" ADD CONSTRAINT "commodity_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "commodity_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing" ADD CONSTRAINT "listing_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing" ADD CONSTRAINT "listing_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "commodity_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing" ADD CONSTRAINT "listing_commodity_id_fkey" FOREIGN KEY ("commodity_id") REFERENCES "commodity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiation" ADD CONSTRAINT "negotiation_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiation" ADD CONSTRAINT "negotiation_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiation" ADD CONSTRAINT "negotiation_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer" ADD CONSTRAINT "offer_negotiation_id_fkey" FOREIGN KEY ("negotiation_id") REFERENCES "negotiation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer" ADD CONSTRAINT "offer_by_user_id_fkey" FOREIGN KEY ("by_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_requirement" ADD CONSTRAINT "buyer_requirement_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_requirement" ADD CONSTRAINT "buyer_requirement_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "commodity_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recently_viewed_listing" ADD CONSTRAINT "recently_viewed_listing_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recently_viewed_listing" ADD CONSTRAINT "recently_viewed_listing_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broker" ADD CONSTRAINT "broker_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade" ADD CONSTRAINT "trade_negotiation_id_fkey" FOREIGN KEY ("negotiation_id") REFERENCES "negotiation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade" ADD CONSTRAINT "trade_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade" ADD CONSTRAINT "trade_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade" ADD CONSTRAINT "trade_commodity_id_fkey" FOREIGN KEY ("commodity_id") REFERENCES "commodity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade" ADD CONSTRAINT "trade_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade" ADD CONSTRAINT "trade_cancelled_by_admin_fkey" FOREIGN KEY ("cancelled_by_admin") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_route" ADD CONSTRAINT "freight_route_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_template" ADD CONSTRAINT "source_template_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-authored additions below this line.
-- Prisma's schema DSL cannot express partial (WHERE-clause) indexes or CHECK
-- constraints, so these are added here as raw SQL to match the source
-- reference workbook exactly. They are introspected as @@ignore-able native
-- constraints by `prisma db pull` but are otherwise invisible to the Prisma
-- Client query builder (enforced by Postgres only).
-- ---------------------------------------------------------------------------

-- Partial UNIQUE indexes (one row matching a condition)
CREATE UNIQUE INDEX "uq_invite_open_phone" ON "invite"("phone") WHERE "status" = 'pending';

CREATE UNIQUE INDEX "uq_neg_open" ON "negotiation"("listing_id", "buyer_id") WHERE "status" = 'open';

CREATE UNIQUE INDEX "uq_offer_pending" ON "offer"("negotiation_id") WHERE "status" = 'pending';

-- Partial regular index
CREATE INDEX "ix_listing_active" ON "listing"("status") WHERE "status" = 'active';

-- CHECK constraints
ALTER TABLE "app_user" ADD CONSTRAINT "chk_app_user_default_weight_kg" CHECK ("default_weight_kg" IS NULL OR "default_weight_kg" > 0);

ALTER TABLE "otp_verification" ADD CONSTRAINT "chk_otp_verification_attempts" CHECK ("attempts" >= 0);

ALTER TABLE "listing" ADD CONSTRAINT "chk_listing_quantity_bags" CHECK ("quantity_bags" > 0);
ALTER TABLE "listing" ADD CONSTRAINT "chk_listing_availability_bags" CHECK ("availability_bags" >= 0 AND "availability_bags" <= "quantity_bags");
ALTER TABLE "listing" ADD CONSTRAINT "chk_listing_weight_kg" CHECK ("weight_kg" IS NULL OR "weight_kg" > 0);
ALTER TABLE "listing" ADD CONSTRAINT "chk_listing_price" CHECK ("price" IS NULL OR "price" >= 0);

ALTER TABLE "negotiation" ADD CONSTRAINT "chk_negotiation_buyer_counters_used" CHECK ("buyer_counters_used" >= 0);
ALTER TABLE "negotiation" ADD CONSTRAINT "chk_negotiation_seller_counters_used" CHECK ("seller_counters_used" >= 0);
ALTER TABLE "negotiation" ADD CONSTRAINT "chk_negotiation_buyer_seller_distinct" CHECK ("buyer_id" <> "seller_id");

ALTER TABLE "offer" ADD CONSTRAINT "chk_offer_price" CHECK ("price" >= 0);
ALTER TABLE "offer" ADD CONSTRAINT "chk_offer_bags_requested" CHECK ("bags_requested" > 0);

ALTER TABLE "buyer_requirement" ADD CONSTRAINT "chk_buyer_requirement_weight_per_bag_kg" CHECK ("weight_per_bag_kg" IS NULL OR "weight_per_bag_kg" > 0);
ALTER TABLE "buyer_requirement" ADD CONSTRAINT "chk_buyer_requirement_target_price" CHECK ("target_price" IS NULL OR "target_price" >= 0);
ALTER TABLE "buyer_requirement" ADD CONSTRAINT "chk_buyer_requirement_quantity_bags" CHECK ("quantity_bags" > 0);

ALTER TABLE "trade" ADD CONSTRAINT "chk_trade_final_price" CHECK ("final_price" >= 0);
ALTER TABLE "trade" ADD CONSTRAINT "chk_trade_quantity_bags" CHECK ("quantity_bags" > 0);
ALTER TABLE "trade" ADD CONSTRAINT "chk_trade_buyer_seller_distinct" CHECK ("buyer_id" <> "seller_id");
ALTER TABLE "trade" ADD CONSTRAINT "chk_trade_broker_xor" CHECK (
  ("is_self" AND "broker_id" IS NULL AND "broker_name_freetext" IS NULL)
  OR (NOT "is_self" AND (("broker_id" IS NOT NULL)::int + ("broker_name_freetext" IS NOT NULL)::int) = 1)
);
ALTER TABLE "trade" ADD CONSTRAINT "chk_trade_cancelled_at_consistency" CHECK (("status" = 'cancelled') = ("cancelled_at" IS NOT NULL));

ALTER TABLE "freight_route" ADD CONSTRAINT "chk_freight_route_price_low" CHECK ("price_low" IS NULL OR "price_low" >= 0);
ALTER TABLE "freight_route" ADD CONSTRAINT "chk_freight_route_price_high" CHECK ("price_high" IS NULL OR "price_low" IS NULL OR "price_high" >= "price_low");
