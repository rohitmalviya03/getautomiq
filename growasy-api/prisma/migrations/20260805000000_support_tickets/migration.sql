-- Help centre / support tickets.
--
-- The SupportTicket and SupportTicketMessage tables already existed but were
-- never used by any code. This adds the fields the help centre needs: how the
-- customer wants to be reached, a triage category, and the timestamp that
-- drives the "waiting on us" queue.
--
-- All columns are nullable or defaulted, so existing rows (if any) stay valid.

-- AlterTable
ALTER TABLE `supportticket`
  ADD COLUMN `category` ENUM('BILLING', 'INSTAGRAM_CONNECTION', 'AUTOMATIONS', 'BUG', 'FEATURE_REQUEST', 'OTHER') NOT NULL DEFAULT 'OTHER',
  ADD COLUMN `contactEmail` VARCHAR(255) NULL,
  ADD COLUMN `contactPhone` VARCHAR(32) NULL,
  ADD COLUMN `lastCustomerReplyAt` DATETIME(3) NULL;

-- Admin queue is sorted newest-first and filtered by status; this covers it.
CREATE INDEX `SupportTicket_createdAt_idx` ON `supportticket`(`createdAt`);
