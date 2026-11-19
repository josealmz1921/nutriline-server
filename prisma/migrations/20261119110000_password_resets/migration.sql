-- Additive; no password/account/session rewritten by the migration.
CREATE TABLE `password_resets` (
 `id` CHAR(36) NOT NULL, `user_id` CHAR(36) NOT NULL, `token_hash` CHAR(64) NOT NULL,
 `delivery_payload` VARCHAR(512) NULL, `delivery_attempts` INTEGER NOT NULL DEFAULT 0,
 `last_delivery_attempt_at` DATETIME(3) NULL, `delivered_at` DATETIME(3) NULL,
 `expires_at` DATETIME(3) NOT NULL, `used_at` DATETIME(3) NULL,
 `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`),
 UNIQUE INDEX `password_resets_token_hash_key` (`token_hash`),
 INDEX `password_resets_user_id_created_at_idx` (`user_id`,`created_at`),
 INDEX `password_resets_delivered_at_expires_at_idx` (`delivered_at`,`expires_at`),
 CONSTRAINT `password_resets_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
