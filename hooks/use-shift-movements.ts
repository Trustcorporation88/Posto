import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { createShiftMovementStore } from "@/lib/shift-movements-store";
import {
  readMovementData,
  writeMovementData,
} from "@/lib/shift-movements-storage";
import { readOpeningData } from "@/lib/shift-opening-storage";

const store = createShiftMovementStore({
  read: readMovementData,
  write: writeMovementData,
  readOpening: readOpeningData,
});
const safeReload = () => store.reload().catch(() => undefined);
export function useShiftMovements() {
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  useEffect(() => {
    void safeReload();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void safeReload();
    });
    return () => sub.remove();
  }, []);
  return { ...snapshot, reload: safeReload, record: store.record };
}
