-- Additive: independent prescriptions, never consumption/R24 or agenda.
CREATE TABLE `daily_menus` (
 `id` CHAR(36) NOT NULL, `patient_id` CHAR(36) NOT NULL, `nutritionist_id` CHAR(36) NOT NULL,
 `date` DATE NOT NULL, `revision` INTEGER NOT NULL DEFAULT 1,
 `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`), UNIQUE INDEX `daily_menus_id_nutritionist_id_key` (`id`,`nutritionist_id`),
 INDEX `daily_menus_patient_id_date_id_idx` (`patient_id`,`date`,`id`),
 CONSTRAINT `daily_menus_patient_id_nutritionist_id_fkey` FOREIGN KEY (`patient_id`,`nutritionist_id`) REFERENCES `patients` (`id`,`nutritionist_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT `daily_menus_nutritionist_id_fkey` FOREIGN KEY (`nutritionist_id`) REFERENCES `nutritionist_profiles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `daily_menu_revisions` (
 `id` CHAR(36) NOT NULL, `menu_id` CHAR(36) NOT NULL, `nutritionist_id` CHAR(36) NOT NULL,
 `revision` INTEGER NOT NULL, `schema_version` INTEGER NOT NULL DEFAULT 1, `capture` JSON NOT NULL,
 `patient_snapshot` JSON NOT NULL, `professional_snapshot` JSON NOT NULL,
 `client_request_id` CHAR(36) NOT NULL, `request_hash` CHAR(64) NOT NULL,
 `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`),
 UNIQUE INDEX `daily_menu_revisions_menu_id_revision_key` (`menu_id`,`revision`),
 UNIQUE INDEX `daily_menu_revisions_nutritionist_id_client_request_id_key` (`nutritionist_id`,`client_request_id`),
 CONSTRAINT `daily_menu_revisions_menu_id_nutritionist_id_fkey` FOREIGN KEY (`menu_id`,`nutritionist_id`) REFERENCES `daily_menus` (`id`,`nutritionist_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
