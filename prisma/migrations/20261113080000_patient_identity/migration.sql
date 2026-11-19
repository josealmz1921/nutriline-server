-- Additive only: existing patients retain unknown identity fields as NULL.
ALTER TABLE `patients`
  ADD COLUMN `gender` VARCHAR(16) NULL,
  ADD COLUMN `nationality` CHAR(2) NULL;
