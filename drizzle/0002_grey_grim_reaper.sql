CREATE TABLE `business_fuel_adjustments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`locationId` int NOT NULL,
	`tankId` int NOT NULL,
	`productId` int NOT NULL,
	`direction` enum('add','remove') NOT NULL,
	`quantityLiters` decimal(18,3) NOT NULL,
	`unitCostCentsPerLiter` int,
	`reason` varchar(500) NOT NULL,
	`recordedAt` timestamp NOT NULL,
	`authorizedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `business_fuel_adjustments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `business_fuel_cost_states` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`locationId` int NOT NULL,
	`productId` int NOT NULL,
	`quantityLiters` decimal(18,3) NOT NULL DEFAULT '0.000',
	`inventoryValueCents` bigint,
	`costKnown` boolean NOT NULL DEFAULT true,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_fuel_cost_states_id` PRIMARY KEY(`id`),
	CONSTRAINT `fuel_cost_state_product_uq` UNIQUE(`organizationId`,`locationId`,`productId`)
);
--> statement-breakpoint
CREATE TABLE `business_fuel_inventory_movements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`locationId` int NOT NULL,
	`productId` int NOT NULL,
	`tankId` int NOT NULL,
	`movementType` enum('receipt','nozzle_sale','adjustment_add','adjustment_remove') NOT NULL,
	`quantityLiters` decimal(18,3) NOT NULL,
	`movementCostCents` bigint,
	`sourceType` varchar(32) NOT NULL,
	`sourceId` int NOT NULL,
	`occurredAt` timestamp NOT NULL,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `business_fuel_inventory_movements_id` PRIMARY KEY(`id`),
	CONSTRAINT `fuel_movement_source_uq` UNIQUE(`organizationId`,`locationId`,`sourceType`,`sourceId`)
);
--> statement-breakpoint
CREATE TABLE `business_fuel_nozzles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`locationId` int NOT NULL,
	`pumpId` int NOT NULL,
	`tankId` int NOT NULL,
	`productId` int NOT NULL,
	`code` varchar(32) NOT NULL,
	`name` varchar(120) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_fuel_nozzles_id` PRIMARY KEY(`id`),
	CONSTRAINT `fuel_nozzle_scope_pump_code_uq` UNIQUE(`organizationId`,`locationId`,`pumpId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `business_fuel_prices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`locationId` int NOT NULL,
	`productId` int NOT NULL,
	`priceCentsPerLiter` int NOT NULL,
	`effectiveAt` timestamp NOT NULL,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `business_fuel_prices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `business_fuel_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`locationId` int NOT NULL,
	`code` varchar(32) NOT NULL,
	`name` varchar(120) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_fuel_products_id` PRIMARY KEY(`id`),
	CONSTRAINT `fuel_product_scope_code_uq` UNIQUE(`organizationId`,`locationId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `business_fuel_pumps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`locationId` int NOT NULL,
	`code` varchar(32) NOT NULL,
	`name` varchar(120) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_fuel_pumps_id` PRIMARY KEY(`id`),
	CONSTRAINT `fuel_pump_scope_code_uq` UNIQUE(`organizationId`,`locationId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `business_fuel_readings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`locationId` int NOT NULL,
	`nozzleId` int NOT NULL,
	`pumpId` int NOT NULL,
	`tankId` int NOT NULL,
	`productId` int NOT NULL,
	`kind` enum('baseline','interval','reset') NOT NULL,
	`previousCounterLiters` decimal(18,3),
	`counterLiters` decimal(18,3) NOT NULL,
	`quantityLiters` decimal(18,3) NOT NULL,
	`priceId` int,
	`priceCentsPerLiter` int,
	`revenueCents` bigint,
	`costCents` bigint,
	`reason` varchar(500),
	`measuredAt` timestamp NOT NULL,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `business_fuel_readings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `business_fuel_receipts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`locationId` int NOT NULL,
	`productId` int NOT NULL,
	`tankId` int NOT NULL,
	`supplier` varchar(160) NOT NULL,
	`documentReference` varchar(120),
	`quantityLiters` decimal(18,3) NOT NULL,
	`unitCostCentsPerLiter` int NOT NULL,
	`totalCostCents` bigint NOT NULL,
	`receivedAt` timestamp NOT NULL,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `business_fuel_receipts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `business_fuel_tank_inventory_states` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`locationId` int NOT NULL,
	`tankId` int NOT NULL,
	`quantityLiters` decimal(18,3) NOT NULL DEFAULT '0.000',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_fuel_tank_inventory_states_id` PRIMARY KEY(`id`),
	CONSTRAINT `fuel_tank_inventory_tank_uq` UNIQUE(`organizationId`,`locationId`,`tankId`)
);
--> statement-breakpoint
CREATE TABLE `business_fuel_tank_measurements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`locationId` int NOT NULL,
	`tankId` int NOT NULL,
	`productId` int NOT NULL,
	`measuredLiters` decimal(18,3) NOT NULL,
	`theoreticalLiters` decimal(18,3) NOT NULL,
	`varianceLiters` decimal(18,3) NOT NULL,
	`status` enum('matched','pending') NOT NULL,
	`reason` varchar(500),
	`measuredAt` timestamp NOT NULL,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `business_fuel_tank_measurements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `business_fuel_tanks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`locationId` int NOT NULL,
	`productId` int NOT NULL,
	`code` varchar(32) NOT NULL,
	`name` varchar(120) NOT NULL,
	`capacityLiters` decimal(18,3),
	`active` boolean NOT NULL DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_fuel_tanks_id` PRIMARY KEY(`id`),
	CONSTRAINT `fuel_tank_scope_code_uq` UNIQUE(`organizationId`,`locationId`,`code`)
);
--> statement-breakpoint
CREATE INDEX `fuel_adjustment_scope_tank_time_idx` ON `business_fuel_adjustments` (`organizationId`,`locationId`,`tankId`,`recordedAt`);--> statement-breakpoint
CREATE INDEX `fuel_movement_scope_product_time_idx` ON `business_fuel_inventory_movements` (`organizationId`,`locationId`,`productId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `fuel_movement_scope_tank_time_idx` ON `business_fuel_inventory_movements` (`organizationId`,`locationId`,`tankId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `fuel_nozzle_scope_tank_idx` ON `business_fuel_nozzles` (`organizationId`,`locationId`,`tankId`,`active`);--> statement-breakpoint
CREATE INDEX `fuel_nozzle_scope_product_idx` ON `business_fuel_nozzles` (`organizationId`,`locationId`,`productId`,`active`);--> statement-breakpoint
CREATE INDEX `fuel_price_scope_product_effective_idx` ON `business_fuel_prices` (`organizationId`,`locationId`,`productId`,`effectiveAt`);--> statement-breakpoint
CREATE INDEX `fuel_product_scope_active_idx` ON `business_fuel_products` (`organizationId`,`locationId`,`active`);--> statement-breakpoint
CREATE INDEX `fuel_pump_scope_active_idx` ON `business_fuel_pumps` (`organizationId`,`locationId`,`active`);--> statement-breakpoint
CREATE INDEX `fuel_reading_scope_nozzle_time_idx` ON `business_fuel_readings` (`organizationId`,`locationId`,`nozzleId`,`measuredAt`);--> statement-breakpoint
CREATE INDEX `fuel_reading_scope_period_idx` ON `business_fuel_readings` (`organizationId`,`locationId`,`measuredAt`);--> statement-breakpoint
CREATE INDEX `fuel_reading_scope_product_idx` ON `business_fuel_readings` (`organizationId`,`locationId`,`productId`,`measuredAt`);--> statement-breakpoint
CREATE INDEX `fuel_receipt_scope_time_idx` ON `business_fuel_receipts` (`organizationId`,`locationId`,`receivedAt`);--> statement-breakpoint
CREATE INDEX `fuel_receipt_scope_product_idx` ON `business_fuel_receipts` (`organizationId`,`locationId`,`productId`,`receivedAt`);--> statement-breakpoint
CREATE INDEX `fuel_tank_measure_scope_tank_time_idx` ON `business_fuel_tank_measurements` (`organizationId`,`locationId`,`tankId`,`measuredAt`);--> statement-breakpoint
CREATE INDEX `fuel_tank_measure_scope_period_idx` ON `business_fuel_tank_measurements` (`organizationId`,`locationId`,`measuredAt`);--> statement-breakpoint
CREATE INDEX `fuel_tank_scope_product_idx` ON `business_fuel_tanks` (`organizationId`,`locationId`,`productId`,`active`);