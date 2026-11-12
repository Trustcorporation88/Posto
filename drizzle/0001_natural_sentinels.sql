CREATE TABLE `business_audit` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`locationId` int NOT NULL,
	`actorUserId` int,
	`event` varchar(80) NOT NULL,
	`targetId` int,
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `business_audit_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `business_invitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`locationId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`role` enum('manager','cashier','attendant','oil_technician','finance_viewer') NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`acceptedAt` timestamp,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `business_invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_invitation_token_uq` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `business_locations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`city` varchar(100) NOT NULL DEFAULT 'Bauru',
	`state` varchar(2) NOT NULL DEFAULT 'SP',
	`timezone` varchar(64) NOT NULL DEFAULT 'America/Sao_Paulo',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `business_locations_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_location_org_name_uq` UNIQUE(`organizationId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `business_memberships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`organizationId` int NOT NULL,
	`locationId` int NOT NULL,
	`role` enum('owner','manager','cashier','attendant','oil_technician','finance_viewer') NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `business_memberships_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_membership_user_location_uq` UNIQUE(`userId`,`locationId`)
);
--> statement-breakpoint
CREATE TABLE `business_organizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`singletonKey` varchar(16) NOT NULL DEFAULT 'primary',
	`name` varchar(160) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `business_organizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_organizations_singletonKey_unique` UNIQUE(`singletonKey`)
);
--> statement-breakpoint
CREATE TABLE `business_password_resets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`organizationId` int NOT NULL,
	`locationId` int NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `business_password_resets_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_password_reset_token_uq` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `business_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`csrfHash` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `business_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_session_token_uq` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `business_users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`name` varchar(120) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`disabledAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_users_email_uq` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE INDEX `business_audit_scope_time_idx` ON `business_audit` (`organizationId`,`locationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `business_audit_actor_idx` ON `business_audit` (`actorUserId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `business_invitation_scope_idx` ON `business_invitations` (`organizationId`,`locationId`,`acceptedAt`);--> statement-breakpoint
CREATE INDEX `business_invitation_email_idx` ON `business_invitations` (`email`);--> statement-breakpoint
CREATE INDEX `business_location_org_idx` ON `business_locations` (`organizationId`);--> statement-breakpoint
CREATE INDEX `business_membership_scope_idx` ON `business_memberships` (`organizationId`,`locationId`,`userId`);--> statement-breakpoint
CREATE INDEX `business_membership_user_active_idx` ON `business_memberships` (`userId`,`active`);--> statement-breakpoint
CREATE INDEX `business_password_reset_user_state_idx` ON `business_password_resets` (`userId`,`usedAt`,`expiresAt`);--> statement-breakpoint
CREATE INDEX `business_session_user_state_idx` ON `business_sessions` (`userId`,`revokedAt`,`expiresAt`);