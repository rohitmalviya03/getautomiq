-- Visitor / traffic analytics.
--
-- One row per page view. No cookies, no raw IP: `visitorHash` is a salted digest
-- of IP + user agent where the salt rotates daily, so a visitor is countable
-- once per day but is not identifiable and cannot be followed across days.
--
-- Indexed for the three questions the admin dashboard asks: a time range scan,
-- distinct visitors in a range, and top paths.

-- CreateTable
CREATE TABLE `PageView` (
  `id` CHAR(36) NOT NULL,
  `path` VARCHAR(500) NOT NULL,
  `referrerHost` VARCHAR(255) NULL,
  `visitorHash` CHAR(64) NOT NULL,
  `userId` CHAR(36) NULL,
  `organizationId` CHAR(36) NULL,
  `surface` VARCHAR(16) NOT NULL,
  `deviceType` VARCHAR(16) NULL,
  `browser` VARCHAR(32) NULL,
  `country` VARCHAR(2) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `PageView_createdAt_idx`(`createdAt`),
  INDEX `PageView_visitorHash_createdAt_idx`(`visitorHash`, `createdAt`),
  -- Prefix index: utf8mb4 VARCHAR(500) is 2000 bytes, past MySQL's 767-byte key
  -- limit. 191 chars is the usual safe ceiling and longer than any real path.
  INDEX `PageView_path_idx`(`path`(191)),
  INDEX `PageView_surface_createdAt_idx`(`surface`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
