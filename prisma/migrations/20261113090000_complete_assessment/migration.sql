-- Additive. Legacy consultations remain unchanged, with NULL assessment metadata.
ALTER TABLE `consultations`
  ADD COLUMN `assessment` JSON NULL,
  ADD COLUMN `assessment_version` INTEGER NULL,
  ADD COLUMN `client_request_id` CHAR(36) NULL,
  ADD COLUMN `request_hash` CHAR(64) NULL;
CREATE UNIQUE INDEX `consultations_nutritionist_id_client_request_id_key`
  ON `consultations` (`nutritionist_id`, `client_request_id`);
