import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import {
  AppData,
  Transaction,
  createEmptyData,
  createDemoData,
  validateData,
  currentMonth,
} from "@/lib/budget";
import { readStoredData, writeStoredData } from "@/lib/storage";

type BudgetContextType = {
  data: AppData;
  month: string;
  setMonth: (value: string) => void;
  ready: boolean;
  busy: boolean;
  loadError: string;
  reload: () => Promise<void>;
  demo: boolean;
  startDemo: () => void;
  exitDemo: () => void;
  commit: (recipe: (data: AppData) => AppData) => Promise<void>;
  editor: Transaction | null | undefined;
  openEditor: (tx?: Transaction) => void;
  closeEditor: () => void;
  toast: string;
  notify: (message: string) => void;
};
const BudgetContext = createContext<BudgetContextType | null>(null);
export function BudgetProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<AppData>(createEmptyData);
  const [demoData, setDemoData] = useState<AppData | null>(null);
  const [month, setMonth] = useState(currentMonth);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<Transaction | null | undefined>(
    undefined,
  );
  const [toast, setToast] = useState("");
  const dataRef = useRef(saved);
  const savingRef = useRef(false);
  const demoRef = useRef(false);
  const reload = useCallback(async () => {
    setReady(false);
    try {
      const raw = await readStoredData();
      const next =
        raw === null ? createEmptyData() : validateData(JSON.parse(raw));
      dataRef.current = next;
      setSaved(next);
      setLoadError("");
    } catch {
      setLoadError(
        "Não foi possível abrir seus dados locais. Nada foi apagado. Verifique as permissões de armazenamento e tente novamente. Se o problema persistir, preserve os dados do navegador antes de limpar qualquer coisa.",
      );
    } finally {
      setReady(true);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timeout);
  }, [toast]);
  const commit = async (recipe: (data: AppData) => AppData) => {
    if (!ready || loadError)
      throw new Error(
        "Seus dados não estão disponíveis para edição. Tente abrir o armazenamento novamente.",
      );
    if (savingRef.current)
      throw new Error(
        "Um registro está sendo salvo. Tente novamente em um instante.",
      );
    savingRef.current = true;
    setBusy(true);
    try {
      const next = validateData(recipe(dataRef.current));
      if (demoRef.current) {
        setDemoData(next);
      } else {
        try {
          await writeStoredData(JSON.stringify(next));
        } catch {
          throw new Error(
            "Não foi possível salvar no dispositivo. O armazenamento pode estar cheio ou bloqueado. Seus dados anteriores foram preservados.",
          );
        }
        setSaved(next);
      }
      dataRef.current = next;
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  };
  const startDemo = () => {
    if (savingRef.current) return;
    const next = createDemoData(month);
    demoRef.current = true;
    dataRef.current = next;
    setDemoData(next);
    setEditor(undefined);
  };
  const exitDemo = () => {
    if (savingRef.current) return;
    demoRef.current = false;
    dataRef.current = saved;
    setDemoData(null);
    setEditor(undefined);
  };
  return (
    <BudgetContext.Provider
      value={{
        data: demoData ?? saved,
        month,
        setMonth,
        ready,
        busy,
        loadError,
        reload,
        demo: demoData !== null,
        startDemo,
        exitDemo,
        commit,
        editor,
        openEditor: (tx) => setEditor(tx ?? null),
        closeEditor: () => setEditor(undefined),
        toast,
        notify: setToast,
      }}
    >
      {children}
    </BudgetContext.Provider>
  );
}
export function useBudget() {
  const context = useContext(BudgetContext);
  if (!context) throw new Error("BudgetProvider ausente");
  return context;
}
