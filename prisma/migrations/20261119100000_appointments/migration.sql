-- Additive, appointments never create consultations, consumption or menus.
CREATE TABLE `appointments` (
 `id` CHAR(36) NOT NULL, `nutritionist_id` CHAR(36) NOT NULL, `patient_id` CHAR(36) NOT NULL,
 `starts_at` DATETIME(3) NOT NULL, `ends_at` DATETIME(3) NOT NULL,
 `time_zone` VARCHAR(64) NOT NULL, `local_starts_at` VARCHAR(16) NOT NULL,
 `reason` VARCHAR(500) NOT NULL, `notes` VARCHAR(2000) NOT NULL,
 `status` VARCHAR(16) NOT NULL DEFAULT 'scheduled', `version` INTEGER NOT NULL DEFAULT 1,
 `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`), UNIQUE INDEX `appointments_id_nutritionist_id_key` (`id`,`nutritionist_id`),
 INDEX `appointments_nutritionist_id_status_starts_at_ends_at_idx` (`nutritionist_id`,`status`,`starts_at`,`ends_at`),
 INDEX `appointments_patient_id_starts_at_id_idx` (`patient_id`,`starts_at`,`id`),
 CONSTRAINT `appointments_nutritionist_id_fkey` FOREIGN KEY (`nutritionist_id`) REFERENCES `nutritionist_profiles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT `appointments_patient_id_nutritionist_id_fkey` FOREIGN KEY (`patient_id`,`nutritionist_id`) REFERENCES `patients` (`id`,`nutritionist_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `appointment_mutations` (
 `id` CHAR(36) NOT NULL, `appointment_id` CHAR(36) NOT NULL, `nutritionist_id` CHAR(36) NOT NULL,
 `client_request_id` CHAR(36) NOT NULL, `request_hash` CHAR(64) NOT NULL,
 `version` INTEGER NOT NULL, `operation` VARCHAR(16) NOT NULL, `response` JSON NOT NULL,
 `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`),
 UNIQUE INDEX `appointment_mutations_nutritionist_id_client_request_id_key` (`nutritionist_id`,`client_request_id`),
 UNIQUE INDEX `appointment_mutations_appointment_id_version_key` (`appointment_id`,`version`),
 CONSTRAINT `appointment_mutations_appointment_id_nutritionist_id_fkey` FOREIGN KEY (`appointment_id`,`nutritionist_id`) REFERENCES `appointments` (`id`,`nutritionist_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
