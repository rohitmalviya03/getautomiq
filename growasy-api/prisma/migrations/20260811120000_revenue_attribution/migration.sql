-- Revenue attribution.
--
-- Automiq never touches the creator's checkout, so revenue can only exist here
-- because their storefront reported it. `ApiKey` is how that storefront proves
-- who it is; `Conversion` is the reported sale plus the automation it was traced
-- back to.
--
-- Attribution columns are resolved once, when the sale is recorded, and then
-- left alone — re-deriving them later would rewrite past months every time a
-- contact or rule changed.

-- CreateTable
CREATE TABLE `ApiKey` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `keyHash` CHAR(64) NOT NULL,
    `keyPrefix` VARCHAR(24) NOT NULL,
    `createdByUserId` CHAR(36) NULL,
    `lastUsedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ApiKey_keyHash_key`(`keyHash`),
    INDEX `ApiKey_organizationId_idx`(`organizationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Conversion` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `source` ENUM('API', 'MANUAL') NOT NULL,
    `externalId` VARCHAR(120) NULL,
    `value` INTEGER NOT NULL,
    `currency` VARCHAR(10) NOT NULL DEFAULT 'INR',
    `buyerEmail` VARCHAR(255) NULL,
    `contactId` CHAR(36) NULL,
    `ruleId` CHAR(36) NULL,
    `mediaId` VARCHAR(64) NULL,
    `variantId` VARCHAR(8) NULL,
    `trackedLinkId` CHAR(36) NULL,
    `matchedBy` VARCHAR(16) NOT NULL,
    `occurredAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    -- 36 + 120 characters at 4 bytes each stays under the 767-byte key limit.
    -- MySQL allows repeated NULLs in a unique index, so manually marked
    -- conversions (no external id) are not in conflict with one another.
    UNIQUE INDEX `Conversion_organizationId_externalId_key`(`organizationId`, `externalId`),
    INDEX `Conversion_organizationId_occurredAt_idx`(`organizationId`, `occurredAt`),
    INDEX `Conversion_ruleId_variantId_idx`(`ruleId`, `variantId`),
    INDEX `Conversion_contactId_idx`(`contactId`),
    INDEX `Conversion_trackedLinkId_idx`(`trackedLinkId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ApiKey` ADD CONSTRAINT `ApiKey_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApiKey` ADD CONSTRAINT `ApiKey_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Conversion` ADD CONSTRAINT `Conversion_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Conversion` ADD CONSTRAINT `Conversion_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `Contact`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Conversion` ADD CONSTRAINT `Conversion_ruleId_fkey` FOREIGN KEY (`ruleId`) REFERENCES `AutomationRule`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Conversion` ADD CONSTRAINT `Conversion_trackedLinkId_fkey` FOREIGN KEY (`trackedLinkId`) REFERENCES `TrackedLink`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
