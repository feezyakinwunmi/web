import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { Button, Modal } from './ui';

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

interface FeedbackValue {
  toast: (message: string, tone?: ToastTone) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackValue | undefined>(undefined);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);

  const toast = useCallback((message: string, tone: ToastTone = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, tone, message }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>(resolve => setPending({ ...options, resolve })),
    []
  );

  const close = (value: boolean) => {
    pending?.resolve(value);
    setPending(null);
  };

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
        {toasts.map(t => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex items-start gap-2 rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm shadow-xl"
          >
            {t.tone === 'success' && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />}
            {t.tone === 'error' && <AlertTriangle className="mt-0.5 size-4 shrink-0 text-bad" />}
            {t.tone === 'info' && <Info className="mt-0.5 size-4 shrink-0 text-info" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
      <Modal
        open={!!pending}
        onClose={() => close(false)}
        title={pending?.title}
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>Cancel</Button>
            <Button variant={pending?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
              {pending?.confirmLabel || 'Confirm'}
            </Button>
          </>
        }
      >
        {pending?.message}
      </Modal>
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used within FeedbackProvider');
  return ctx;
}
