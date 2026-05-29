'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Variant = 'error' | 'success' | 'info';
interface Toast {
  id: number;
  message: string;
  variant: Variant;
}

const ToastContext = createContext<(message: string, variant?: Variant) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, variant: Variant = 'info') => {
    const id = nextId++;
    setToasts((t) => [...t, { id, message, variant }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-md border px-3 py-2 text-sm shadow-lg ${
              t.variant === 'error'
                ? 'border-red-800 bg-red-950 text-red-200'
                : t.variant === 'success'
                  ? 'border-green-800 bg-green-950 text-green-200'
                  : 'border-neutral-700 bg-neutral-900 text-neutral-200'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
