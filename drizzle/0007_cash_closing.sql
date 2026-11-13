CREATE TABLE `business_cash_closing_audits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`locationId` int NOT NULL,
	`registerId` int NOT NULL,
	`openingId` int NOT NULL,
	`closingId` int NOT NULL,
	`actorId` int NOT NULL,
	`event` varchar(80) NOT NULL,
	`revision` int NOT NULL,
	`payloadDigest` varchar(64) NOT NULL,
	`metadata` text,
	`createdAt` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `business_cash_closing_audits_id` PRIMARY KEY(`id`),
	CONSTRAINT `cash_closing_audit_event_uq` UNIQUE(`organizationId`,`locationId`,`closingId`,`event`)
);
--> statement-breakpoint
CREATE TABLE `business_cash_closings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`locationId` int NOT NULL,
	`registerId` int NOT NULL,
	`openingId` int NOT NULL,
	`closedById` int NOT NULL,
	`closedBy` varchar(120) NOT NULL,
	`closedAt` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`openingSnapshot` text NOT NULL,
	`summarySnapshot` text NOT NULL,
	`totalsSnapshot` text NOT NULL,
	`varianceReason` varchar(500) NOT NULL,
	`status` enum('fechado','diferenca-pendente') NOT NULL,
	`lastMovementId` int,
	`movementCount` bigint NOT NULL,
	`revision` int NOT NULL,
	`intentId` varchar(36) NOT NULL,
	`payloadDigest` varchar(64) NOT NULL,
	CONSTRAINT `business_cash_closings_id` PRIMARY KEY(`id`),
	CONSTRAINT `cash_closing_scope_id_uq` UNIQUE(`organizationId`,`locationId`,`id`),
	CONSTRAINT `cash_closing_opening_uq` UNIQUE(`organizationId`,`locationId`,`openingId`),
	CONSTRAINT `cash_closing_intent_scope_uq` UNIQUE(`organizationId`,`locationId`,`intentId`)
);
--> statement-breakpoint
ALTER TABLE `business_cash_closing_audits` ADD CONSTRAINT `cash_closing_audit_location_fk` FOREIGN KEY (`organizationId`,`locationId`) REFERENCES `business_locations`(`organizationId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_cash_closing_audits` ADD CONSTRAINT `cash_closing_audit_register_fk` FOREIGN KEY (`organizationId`,`locationId`,`registerId`) REFERENCES `business_cash_registers`(`organizationId`,`locationId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_cash_closing_audits` ADD CONSTRAINT `cash_closing_audit_opening_fk` FOREIGN KEY (`organizationId`,`locationId`,`openingId`) REFERENCES `business_cash_openings`(`organizationId`,`locationId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_cash_closing_audits` ADD CONSTRAINT `cash_closing_audit_closure_fk` FOREIGN KEY (`organizationId`,`locationId`,`closingId`) REFERENCES `business_cash_closings`(`organizationId`,`locationId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_cash_closing_audits` ADD CONSTRAINT `cash_closing_audit_actor_membership_fk` FOREIGN KEY (`organizationId`,`locationId`,`actorId`) REFERENCES `business_memberships`(`organizationId`,`locationId`,`userId`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_cash_closings` ADD CONSTRAINT `cash_closing_register_fk` FOREIGN KEY (`organizationId`,`locationId`,`registerId`) REFERENCES `business_cash_registers`(`organizationId`,`locationId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_cash_closings` ADD CONSTRAINT `cash_closing_opening_fk` FOREIGN KEY (`organizationId`,`locationId`,`openingId`) REFERENCES `business_cash_openings`(`organizationId`,`locationId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_cash_closings` ADD CONSTRAINT `cash_closing_actor_membership_fk` FOREIGN KEY (`organizationId`,`locationId`,`closedById`) REFERENCES `business_memberships`(`organizationId`,`locationId`,`userId`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_cash_closings` ADD CONSTRAINT `cash_closing_last_movement_fk` FOREIGN KEY (`organizationId`,`locationId`,`lastMovementId`) REFERENCES `business_cash_movements`(`organizationId`,`locationId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `cash_closing_audit_scope_time_idx` ON `business_cash_closing_audits` (`organizationId`,`locationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `cash_closing_scope_time_idx` ON `business_cash_closings` (`organizationId`,`locationId`,`id`);