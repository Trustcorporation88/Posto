import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { stationRegisterStore } from "@/lib/station-register-client";

const safeReload = () => stationRegisterStore.reload().catch(() => undefined);
export function useStationRegister() {
  const snapshot = useSyncExternalStore(
    stationRegisterStore.subscribe,
    stationRegisterStore.getSnapshot,
    stationRegisterStore.getServerSnapshot,
  );
  useEffect(() => {
    void safeReload();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void safeReload();
    });
    return () => subscription.remove();
  }, []);
  return {
    ...snapshot,
    reload: safeReload,
    open: stationRegisterStore.open,
    record: stationRegisterStore.record,
    close: stationRegisterStore.close,
  };
}
