import { createStationRegisterStore } from "./station-register-store";
import {
  readLegacyMovementData,
  readLegacyOpeningData,
  readStationRegisterData,
  writeStationRegisterData,
} from "./station-register-storage";

export const stationRegisterStore = createStationRegisterStore({
  read: readStationRegisterData,
  write: writeStationRegisterData,
  readLegacyOpening: readLegacyOpeningData,
  readLegacyMovements: readLegacyMovementData,
});
