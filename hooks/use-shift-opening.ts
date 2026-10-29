import { openingDataForRegister } from "@/lib/station-register";
import { useStationRegister } from "@/hooks/use-station-register";

export function useShiftOpening() {
  const state = useStationRegister();
  return {
    ...state,
    register: state.data,
    data: openingDataForRegister(state.data),
  };
}
