import { createContext } from "preact";
import { useCallback, useContext, useState } from "preact/hooks";
import { ApiError } from "./api";

type Notify = (message: string, kind?: "ok" | "error") => void;
const ToastContext = createContext<Notify>(() => {});

export function ToastHost({ children }: { children: preact.ComponentChildren }) {
  const [toast, setToast] = useState<{ message: string; kind: "ok" | "error"; id: number } | null>(null);
  const notify = useCallback<Notify>((message, kind = "ok") => {
    const id = Date.now();
    setToast({ message, kind, id });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 4000);
  }, []);
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div class="toast-region" role="status" aria-live="polite">
        {toast && <div class={`toast toast-${toast.kind}`}>{toast.message}</div>}
      </div>
    </ToastContext.Provider>
  );
}

/** Runs an API call and reports the outcome in the toast. */
export function useRun() {
  const notify = useContext(ToastContext);
  return async <T,>(done: string, call: () => Promise<T>): Promise<T | undefined> => {
    try {
      const r = await call();
      if (done) notify(done);
      return r;
    } catch (e) {
      notify(e instanceof ApiError || e instanceof Error ? e.message : String(e), "error");
      return undefined;
    }
  };
}
