import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { createShiftOpeningStore } from "@/lib/shift-opening-store";
import { readOpeningData, writeOpeningData } from "@/lib/shift-opening-storage";

// Um store por contexto JavaScript, inclusive quando a tela é remontada.
// Não representa sincronização entre abas, processos ou aparelhos.
const openingStore = createShiftOpeningStore({
  read: readOpeningData,
  write: writeOpeningData,
});

// O store publica loadError. Efeitos e botões não devem gerar rejeição não tratada.
const reloadOpening = () => openingStore.reload().catch(() => undefined);

export function useShiftOpening() {
  const snapshot = useSyncExternalStore(
    openingStore.subscribe,
    openingStore.getSnapshot,
    openingStore.getServerSnapshot,
  );

  useEffect(() => {
    void reloadOpening();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void reloadOpening();
    });
    return () => subscription.remove();
  }, []);

  return {
    ...snapshot,
    reload: reloadOpening,
    open: openingStore.open,
  };
}
