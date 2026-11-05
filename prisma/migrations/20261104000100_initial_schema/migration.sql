-- CreateTable
CREATE TABLE `users` (
    `id` CHAR(36) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` ENUM('ADMIN', 'NUTRITIONIST') NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `nutritionist_profiles` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `display_name` VARCHAR(150) NOT NULL,
    `timezone` VARCHAR(64) NOT NULL DEFAULT 'America/Mexico_City',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `nutritionist_profiles_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auth_sessions` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `refresh_token_hash` CHAR(64) NOT NULL,
    `family_id` CHAR(36) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `auth_sessions_refresh_token_hash_key`(`refresh_token_hash`),
    INDEX `auth_sessions_user_id_expires_at_idx`(`user_id`, `expires_at`),
    INDEX `auth_sessions_family_id_idx`(`family_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `patients` (
    `id` CHAR(36) NOT NULL,
    `nutritionist_id` CHAR(36) NOT NULL,
    `full_name` VARCHAR(150) NOT NULL,
    `birth_date` DATE NOT NULL,
    `email` VARCHAR(254) NULL,
    `phone` VARCHAR(32) NULL,
    `occupation` VARCHAR(150) NULL,
    `archived_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `patients_nutritionist_id_archived_at_full_name_idx`(`nutritionist_id`, `archived_at`, `full_name`),
    UNIQUE INDEX `patients_id_nutritionist_id_key`(`id`, `nutritionist_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `consultations` (
    `id` CHAR(36) NOT NULL,
    `patient_id` CHAR(36) NOT NULL,
    `nutritionist_id` CHAR(36) NOT NULL,
    `occurred_at` DATETIME(3) NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `consultations_patient_id_occurred_at_id_idx`(`patient_id`, `occurred_at`, `id`),
    INDEX `consultations_nutritionist_id_occurred_at_idx`(`nutritionist_id`, `occurred_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `anthropometric_assessments` (
    `id` CHAR(36) NOT NULL,
    `consultation_id` CHAR(36) NOT NULL,
    `measured_at` DATETIME(3) NOT NULL,
    `weight_kg` DECIMAL(8, 3) NOT NULL,
    `height_cm` DECIMAL(8, 3) NOT NULL,
    `waist_cm` DECIMAL(8, 3) NULL,
    `hip_cm` DECIMAL(8, 3) NULL,

    UNIQUE INDEX `anthropometric_assessments_consultation_id_key`(`consultation_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `calculation_results` (
    `id` CHAR(36) NOT NULL,
    `consultation_id` CHAR(36) NOT NULL,
    `method_code` VARCHAR(64) NOT NULL,
    `method_version` VARCHAR(16) NOT NULL,
    `inputs` JSON NOT NULL,
    `value` DECIMAL(12, 6) NOT NULL,
    `unit` VARCHAR(32) NOT NULL,
    `calculated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `calculation_results_consultation_id_method_code_method_versi_key`(`consultation_id`, `method_code`, `method_version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `nutritionist_profiles` ADD CONSTRAINT `nutritionist_profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auth_sessions` ADD CONSTRAINT `auth_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `patients` ADD CONSTRAINT `patients_nutritionist_id_fkey` FOREIGN KEY (`nutritionist_id`) REFERENCES `nutritionist_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consultations` ADD CONSTRAINT `consultations_patient_id_nutritionist_id_fkey` FOREIGN KEY (`patient_id`, `nutritionist_id`) REFERENCES `patients`(`id`, `nutritionist_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consultations` ADD CONSTRAINT `consultations_nutritionist_id_fkey` FOREIGN KEY (`nutritionist_id`) REFERENCES `nutritionist_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `anthropometric_assessments` ADD CONSTRAINT `anthropometric_assessments_consultation_id_fkey` FOREIGN KEY (`consultation_id`) REFERENCES `consultations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `calculation_results` ADD CONSTRAINT `calculation_results_consultation_id_fkey` FOREIGN KEY (`consultation_id`) REFERENCES `consultations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
