-- IF NOT EXISTS preserves the verified tables from an interrupted initial DDL run.
CREATE TABLE IF NOT EXISTS `business_cash_opening_audits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`locationId` int NOT NULL,
	`registerId` int NOT NULL,
	`openingId` int NOT NULL,
	`actorId` int NOT NULL,
	`event` varchar(80) NOT NULL,
	`revision` int NOT NULL,
	`payloadDigest` varchar(64) NOT NULL,
	`metadata` text,
	`createdAt` timestamp(3) NOT NULL,
	CONSTRAINT `business_cash_opening_audits_id` PRIMARY KEY(`id`),
	CONSTRAINT `cash_opening_audit_event_uq` UNIQUE(`organizationId`,`locationId`,`openingId`,`event`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `business_cash_openings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`locationId` int NOT NULL,
	`registerId` int NOT NULL,
	`operatorId` int NOT NULL,
	`operator` varchar(120) NOT NULL,
	`openingFloatCents` bigint NOT NULL,
	`operationDate` date NOT NULL,
	`timeZone` varchar(64) NOT NULL DEFAULT 'America/Sao_Paulo',
	`shiftId` enum('turno-1','turno-2') NOT NULL,
	`shiftLabel` varchar(40) NOT NULL,
	`shiftStart` varchar(5) NOT NULL,
	`shiftEnd` varchar(5) NOT NULL,
	`openedAt` timestamp(3) NOT NULL,
	`activeSlot` varchar(16) DEFAULT 'active',
	`intentId` varchar(36) NOT NULL,
	`payloadDigest` varchar(64) NOT NULL,
	`resultRevision` int NOT NULL,
	CONSTRAINT `business_cash_openings_id` PRIMARY KEY(`id`),
	CONSTRAINT `cash_opening_intent_scope_uq` UNIQUE(`organizationId`,`locationId`,`intentId`),
	CONSTRAINT `cash_opening_active_slot_uq` UNIQUE(`organizationId`,`locationId`,`registerId`,`activeSlot`),
	CONSTRAINT `cash_opening_scope_id_uq` UNIQUE(`organizationId`,`locationId`,`id`)
);
--> statement-breakpoint
CREATE TABLE `business_cash_registers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`locationId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`revision` int NOT NULL DEFAULT 0,
	`createdBy` int NOT NULL,
	`createdAt` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `business_cash_registers_id` PRIMARY KEY(`id`),
	CONSTRAINT `cash_register_location_uq` UNIQUE(`organizationId`,`locationId`),
	CONSTRAINT `cash_register_scope_id_uq` UNIQUE(`organizationId`,`locationId`,`id`)
);
--> statement-breakpoint
ALTER TABLE `business_memberships` ADD CONSTRAINT `business_membership_scope_user_uq` UNIQUE(`organizationId`,`locationId`,`userId`);--> statement-breakpoint
ALTER TABLE `business_cash_opening_audits` ADD CONSTRAINT `cash_opening_audit_opening_fk` FOREIGN KEY (`organizationId`,`locationId`,`openingId`) REFERENCES `business_cash_openings`(`organizationId`,`locationId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_cash_opening_audits` ADD CONSTRAINT `cash_opening_audit_register_fk` FOREIGN KEY (`organizationId`,`locationId`,`registerId`) REFERENCES `business_cash_registers`(`organizationId`,`locationId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_cash_opening_audits` ADD CONSTRAINT `cash_opening_audit_actor_membership_fk` FOREIGN KEY (`organizationId`,`locationId`,`actorId`) REFERENCES `business_memberships`(`organizationId`,`locationId`,`userId`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_cash_openings` ADD CONSTRAINT `cash_opening_register_fk` FOREIGN KEY (`organizationId`,`locationId`,`registerId`) REFERENCES `business_cash_registers`(`organizationId`,`locationId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_cash_openings` ADD CONSTRAINT `cash_opening_operator_membership_fk` FOREIGN KEY (`organizationId`,`locationId`,`operatorId`) REFERENCES `business_memberships`(`organizationId`,`locationId`,`userId`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_cash_registers` ADD CONSTRAINT `cash_register_location_fk` FOREIGN KEY (`organizationId`,`locationId`) REFERENCES `business_locations`(`organizationId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_cash_registers` ADD CONSTRAINT `cash_register_creator_membership_fk` FOREIGN KEY (`organizationId`,`locationId`,`createdBy`) REFERENCES `business_memberships`(`organizationId`,`locationId`,`userId`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `cash_opening_audit_scope_time_idx` ON `business_cash_opening_audits` (`organizationId`,`locationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `cash_opening_operator_time_idx` ON `business_cash_openings` (`organizationId`,`locationId`,`operatorId`,`openedAt`);--> statement-breakpoint
CREATE INDEX `cash_opening_register_time_idx` ON `business_cash_openings` (`organizationId`,`locationId`,`registerId`,`openedAt`);--> statement-breakpoint
CREATE INDEX `cash_register_creator_idx` ON `business_cash_registers` (`createdBy`,`createdAt`);
