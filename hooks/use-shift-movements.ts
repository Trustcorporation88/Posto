import { movementDataForRegister } from "@/lib/station-register";
import { useStationRegister } from "@/hooks/use-station-register";

export function useShiftMovements() {
  const state = useStationRegister();
  return {
    ...state,
    register: state.data,
    data: movementDataForRegister(state.data),
    opening: state.data.opening,
  };
}
