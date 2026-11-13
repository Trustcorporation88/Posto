CREATE TABLE `business_cash_movement_audits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`locationId` int NOT NULL,
	`registerId` int NOT NULL,
	`openingId` int NOT NULL,
	`movementId` int NOT NULL,
	`actorId` int NOT NULL,
	`event` varchar(80) NOT NULL,
	`revision` int NOT NULL,
	`payloadDigest` varchar(64) NOT NULL,
	`metadata` text,
	`createdAt` timestamp(3) NOT NULL,
	CONSTRAINT `business_cash_movement_audits_id` PRIMARY KEY(`id`),
	CONSTRAINT `cash_movement_audit_event_uq` UNIQUE(`organizationId`,`locationId`,`movementId`,`event`)
);
--> statement-breakpoint
CREATE TABLE `business_cash_movements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`locationId` int NOT NULL,
	`registerId` int NOT NULL,
	`openingId` int NOT NULL,
	`responsibleId` int NOT NULL,
	`responsible` varchar(120) NOT NULL,
	`type` enum('recebimento','sangria','suprimento') NOT NULL,
	`paymentMethod` enum('dinheiro','pix','debito','credito') NOT NULL,
	`receiptNature` enum('venda','conta-anterior'),
	`amountCents` bigint NOT NULL,
	`description` varchar(200) NOT NULL,
	`reference` varchar(120) NOT NULL DEFAULT '',
	`referenceDigest` varchar(64),
	`counterparty` varchar(120) NOT NULL DEFAULT '',
	`intentId` varchar(36) NOT NULL,
	`payloadDigest` varchar(64) NOT NULL,
	`resultRevision` int NOT NULL,
	`recordedAt` timestamp(3) NOT NULL,
	`createdAt` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `business_cash_movements_id` PRIMARY KEY(`id`),
	CONSTRAINT `cash_movement_scope_id_uq` UNIQUE(`organizationId`,`locationId`,`id`),
	CONSTRAINT `cash_movement_intent_scope_uq` UNIQUE(`organizationId`,`locationId`,`intentId`),
	CONSTRAINT `cash_movement_reference_scope_uq` UNIQUE(`organizationId`,`locationId`,`openingId`,`paymentMethod`,`referenceDigest`)
);
--> statement-breakpoint
ALTER TABLE `business_cash_movement_audits` ADD CONSTRAINT `cash_movement_audit_location_fk` FOREIGN KEY (`organizationId`,`locationId`) REFERENCES `business_locations`(`organizationId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_cash_movement_audits` ADD CONSTRAINT `cash_movement_audit_register_fk` FOREIGN KEY (`organizationId`,`locationId`,`registerId`) REFERENCES `business_cash_registers`(`organizationId`,`locationId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_cash_movement_audits` ADD CONSTRAINT `cash_movement_audit_opening_fk` FOREIGN KEY (`organizationId`,`locationId`,`openingId`) REFERENCES `business_cash_openings`(`organizationId`,`locationId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_cash_movement_audits` ADD CONSTRAINT `cash_movement_audit_movement_fk` FOREIGN KEY (`organizationId`,`locationId`,`movementId`) REFERENCES `business_cash_movements`(`organizationId`,`locationId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_cash_movement_audits` ADD CONSTRAINT `cash_movement_audit_actor_fk` FOREIGN KEY (`organizationId`,`locationId`,`actorId`) REFERENCES `business_memberships`(`organizationId`,`locationId`,`userId`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_cash_movements` ADD CONSTRAINT `cash_movement_location_fk` FOREIGN KEY (`organizationId`,`locationId`) REFERENCES `business_locations`(`organizationId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_cash_movements` ADD CONSTRAINT `cash_movement_register_fk` FOREIGN KEY (`organizationId`,`locationId`,`registerId`) REFERENCES `business_cash_registers`(`organizationId`,`locationId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_cash_movements` ADD CONSTRAINT `cash_movement_opening_fk` FOREIGN KEY (`organizationId`,`locationId`,`openingId`) REFERENCES `business_cash_openings`(`organizationId`,`locationId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_cash_movements` ADD CONSTRAINT `cash_movement_author_membership_fk` FOREIGN KEY (`organizationId`,`locationId`,`responsibleId`) REFERENCES `business_memberships`(`organizationId`,`locationId`,`userId`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `cash_movement_audit_scope_time_idx` ON `business_cash_movement_audits` (`organizationId`,`locationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `cash_movement_opening_id_idx` ON `business_cash_movements` (`organizationId`,`locationId`,`openingId`,`id`);--> statement-breakpoint
CREATE INDEX `cash_movement_opening_time_idx` ON `business_cash_movements` (`organizationId`,`locationId`,`openingId`,`recordedAt`);