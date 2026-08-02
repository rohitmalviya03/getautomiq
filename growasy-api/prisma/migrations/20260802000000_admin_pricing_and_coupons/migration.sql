-- Admin-managed pricing + discounts.
--
-- 1. Plan gains the storefront copy that used to be hardcoded in the web app
--    (growasy-web/src/lib/plans.ts) plus an always-on promotional discount.
-- 2. Coupon / CouponRedemption add code-based discounts applied at checkout.
--
-- All new Plan columns are nullable or defaulted, so existing rows stay valid.
-- Run `npx prisma db seed` after this to backfill the storefront copy.

-- AlterTable: storefront copy
ALTER TABLE `plan`
  ADD COLUMN `tag` VARCHAR(50) NULL,
  ADD COLUMN `subtitle` VARCHAR(255) NULL,
  ADD COLUMN `ctaLabel` VARCHAR(60) NULL,
  ADD COLUMN `inheritsLabel` VARCHAR(120) NULL,
  ADD COLUMN `isPopular` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `isBestValue` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `contactSales` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `isPublic` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `sortOrder` INTEGER NOT NULL DEFAULT 0;

-- AlterTable: always-on promotional discount
ALTER TABLE `plan`
  ADD COLUMN `promoType` ENUM('PERCENT', 'FLAT') NULL,
  ADD COLUMN `promoValue` INTEGER NULL,
  ADD COLUMN `promoLabel` VARCHAR(80) NULL,
  ADD COLUMN `promoStartsAt` DATETIME(3) NULL,
  ADD COLUMN `promoEndsAt` DATETIME(3) NULL;

-- AlterTable: link a payment back to its Razorpay order + coupon, so activation
-- reads the server-computed amount instead of trusting the browser.
ALTER TABLE `payment`
  ADD COLUMN `externalOrderId` VARCHAR(128) NULL,
  ADD COLUMN `couponId` CHAR(36) NULL;

CREATE INDEX `Payment_externalOrderId_idx` ON `payment`(`externalOrderId`);

-- CreateTable
CREATE TABLE `Coupon` (
  `id` CHAR(36) NOT NULL,
  `code` VARCHAR(40) NOT NULL,
  `description` VARCHAR(255) NULL,
  `type` ENUM('PERCENT', 'FLAT') NOT NULL,
  `value` INTEGER NOT NULL,
  `appliesToTiers` VARCHAR(255) NOT NULL DEFAULT '[]',
  `appliesToCycles` VARCHAR(64) NOT NULL DEFAULT '[]',
  `maxRedemptions` INTEGER NULL,
  `maxPerOrg` INTEGER NOT NULL DEFAULT 1,
  `redeemedCount` INTEGER NOT NULL DEFAULT 0,
  `startsAt` DATETIME(3) NULL,
  `endsAt` DATETIME(3) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdById` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `Coupon_code_key`(`code`),
  INDEX `Coupon_isActive_idx`(`isActive`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CouponRedemption` (
  `id` CHAR(36) NOT NULL,
  `couponId` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `userId` CHAR(36) NULL,
  `externalPaymentId` VARCHAR(128) NOT NULL,
  `amountBefore` INTEGER NOT NULL,
  `amountAfter` INTEGER NOT NULL,
  `discountAmount` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `CouponRedemption_couponId_externalPaymentId_key`(`couponId`, `externalPaymentId`),
  INDEX `CouponRedemption_organizationId_idx`(`organizationId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CouponRedemption`
  ADD CONSTRAINT `CouponRedemption_couponId_fkey`
  FOREIGN KEY (`couponId`) REFERENCES `Coupon`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CouponRedemption`
  ADD CONSTRAINT `CouponRedemption_organizationId_fkey`
  FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
