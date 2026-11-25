CREATE TABLE `admin_account_events` (
  `id` CHAR(36) NOT NULL,
  `actor_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `action` VARCHAR(32) NOT NULL,
  `reason` VARCHAR(1000) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `admin_account_events_user_id_created_at_id_idx` (`user_id`, `created_at`, `id`),
  INDEX `admin_account_events_created_at_id_idx` (`created_at`, `id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `admin_account_events_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `admin_account_events_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
