CREATE TABLE `billing_subscriptions` (
  `id` CHAR(36) NOT NULL,
  `nutritionist_id` CHAR(36) NOT NULL,
  `plan_code` VARCHAR(100) NOT NULL,
  `status` ENUM('ACTIVE','PAST_DUE','CANCELLED','EXPIRED') NOT NULL,
  `starts_at` DATETIME(3) NOT NULL,
  `ends_at` DATETIME(3) NULL,
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `billing_subscriptions_nutritionist_id_key` (`nutritionist_id`),
  INDEX `billing_subscriptions_status_ends_at_idx` (`status`,`ends_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `billing_payments` (
  `id` CHAR(36) NOT NULL,
  `nutritionist_id` CHAR(36) NOT NULL,
  `provider` ENUM('ADYEN','MERCADO_PAGO') NOT NULL,
  `external_id` VARCHAR(191) NOT NULL,
  `amount_minor` INTEGER UNSIGNED NOT NULL,
  `currency` CHAR(3) NOT NULL,
  `status` ENUM('PENDING','SUCCEEDED','FAILED','CANCELLED','PARTIALLY_REFUNDED','REFUNDED') NOT NULL,
  `paid_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `billing_payments_nutritionist_id_created_at_id_idx` (`nutritionist_id`,`created_at`,`id`),
  INDEX `billing_payments_status_created_at_idx` (`status`,`created_at`),
  UNIQUE INDEX `billing_payments_provider_external_id_key` (`provider`,`external_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `support_tickets` (
  `id` CHAR(36) NOT NULL,
  `nutritionist_id` CHAR(36) NOT NULL,
  `client_request_id` CHAR(36) NOT NULL,
  `request_hash` CHAR(64) NOT NULL,
  `subject` VARCHAR(150) NOT NULL,
  `category` ENUM('ERROR','QUESTION','PAYMENT') NOT NULL,
  `status` ENUM('OPEN','IN_PROGRESS','WAITING_REPLY','RESOLVED','CLOSED') NOT NULL DEFAULT 'OPEN',
  `priority` ENUM('NORMAL','HIGH','URGENT') NOT NULL DEFAULT 'NORMAL',
  `assigned_to_id` CHAR(36) NULL,
  `payment_id` CHAR(36) NULL,
  `version` INTEGER NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `support_tickets_nutritionist_id_status_created_at_idx` (`nutritionist_id`,`status`,`created_at`),
  INDEX `support_tickets_status_updated_at_id_idx` (`status`,`updated_at`,`id`),
  UNIQUE INDEX `support_tickets_nutritionist_id_client_request_id_key` (`nutritionist_id`,`client_request_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `support_messages` (
  `id` CHAR(36) NOT NULL,
  `ticket_id` CHAR(36) NOT NULL,
  `author_id` CHAR(36) NOT NULL,
  `client_request_id` CHAR(36) NOT NULL,
  `body` TEXT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `support_messages_ticket_id_created_at_id_idx` (`ticket_id`,`created_at`,`id`),
  UNIQUE INDEX `support_messages_ticket_id_client_request_id_key` (`ticket_id`,`client_request_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `support_events` (
  `id` CHAR(36) NOT NULL,
  `ticket_id` CHAR(36) NOT NULL,
  `actor_id` CHAR(36) NOT NULL,
  `action` VARCHAR(32) NOT NULL,
  `details` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `support_events_ticket_id_created_at_id_idx` (`ticket_id`,`created_at`,`id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `billing_subscriptions` ADD CONSTRAINT `billing_subscriptions_nutritionist_id_fkey` FOREIGN KEY (`nutritionist_id`) REFERENCES `nutritionist_profiles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `billing_payments` ADD CONSTRAINT `billing_payments_nutritionist_id_fkey` FOREIGN KEY (`nutritionist_id`) REFERENCES `nutritionist_profiles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `support_tickets` ADD CONSTRAINT `support_tickets_nutritionist_id_fkey` FOREIGN KEY (`nutritionist_id`) REFERENCES `nutritionist_profiles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `support_tickets` ADD CONSTRAINT `support_tickets_assigned_to_id_fkey` FOREIGN KEY (`assigned_to_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `support_tickets` ADD CONSTRAINT `support_tickets_payment_id_fkey` FOREIGN KEY (`payment_id`) REFERENCES `billing_payments` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `support_messages` ADD CONSTRAINT `support_messages_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `support_tickets` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `support_messages` ADD CONSTRAINT `support_messages_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `support_events` ADD CONSTRAINT `support_events_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `support_tickets` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `support_events` ADD CONSTRAINT `support_events_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
