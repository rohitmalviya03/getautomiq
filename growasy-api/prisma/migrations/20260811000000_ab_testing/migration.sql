-- A/B testing for automation DMs.
--
-- The variant that was sent is recorded on the event ledger, and carried onto
-- the lead-capture row it opened, so a completed capture can be credited to the
-- message that earned it rather than just counted in aggregate.
--
-- Both columns are nullable: every rule that exists today has a single message
-- and keeps writing NULL, which reads as "no experiment running".

-- AlterTable
ALTER TABLE `processedcomment` ADD COLUMN `variantId` VARCHAR(8) NULL;

-- AlterTable
ALTER TABLE `pendingleadcapture` ADD COLUMN `variantId` VARCHAR(8) NULL;

-- Results are read per rule, grouped by variant.
CREATE INDEX `ProcessedComment_ruleId_variantId_idx` ON `processedcomment`(`ruleId`, `variantId`);
