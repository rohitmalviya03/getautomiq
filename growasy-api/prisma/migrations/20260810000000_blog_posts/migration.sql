-- Marketing blog, authored from the admin console.
--
-- `content` is Markdown rather than HTML: it is escaped before rendering on the
-- public site, so stored content can never inject script into a page.
--
-- The slug carries a unique index at VARCHAR(191) — the utf8mb4 ceiling for a
-- MySQL index key (191 x 4 = 764 bytes, under the 767-byte limit).

-- CreateTable
CREATE TABLE `BlogPost` (
  `id` CHAR(36) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `summary` VARCHAR(500) NOT NULL,
  `content` LONGTEXT NOT NULL,
  `status` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `coverImageUrl` VARCHAR(1024) NULL,
  `coverImageAlt` VARCHAR(255) NULL,
  `tags` VARCHAR(500) NOT NULL DEFAULT '[]',
  `seoTitle` VARCHAR(255) NULL,
  `seoDescription` VARCHAR(320) NULL,
  `readingMinutes` INTEGER NOT NULL DEFAULT 1,
  `viewCount` INTEGER NOT NULL DEFAULT 0,
  `authorUserId` CHAR(36) NULL,
  `publishedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `deletedAt` DATETIME(3) NULL,

  UNIQUE INDEX `BlogPost_slug_key`(`slug`),
  INDEX `BlogPost_status_publishedAt_idx`(`status`, `publishedAt`),
  INDEX `BlogPost_deletedAt_idx`(`deletedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `BlogPost`
  ADD CONSTRAINT `BlogPost_authorUserId_fkey`
  FOREIGN KEY (`authorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
