import { useEffect, useState } from "react";
import { AppState } from "react-native";

/** Relógio de consulta da interface. Não abre nem fecha um caixa. */
export function useStationClock(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const refresh = () => {
      if (disposed) return;
      if (timer) clearTimeout(timer);
      setNow(new Date());
      // Os turnos começam em minutos exatos. Não esperar um intervalo arbitrário.
      timer = setTimeout(refresh, 60_000 - (Date.now() % 60_000) + 50);
    };

    refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
      else if (timer) clearTimeout(timer);
    });

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      subscription.remove();
    };
  }, []);

  return now;
}
