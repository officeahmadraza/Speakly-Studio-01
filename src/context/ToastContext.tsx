import React, { createContext, useContext, useState, useCallback } from 'react';
import { AlertCircle, CheckCircle2, Info, X, AlertTriangle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

interface ToastContextType {
  toasts: ToastMessage[];
  showToast: (message: string, type?: ToastType, title?: string, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', title?: string, duration: number = 4000) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast: ToastMessage = { id, type, title, message, duration };

      setToasts(prev => [...prev.slice(-4), newToast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
      {/* Toast viewport container (above mobile navigation) */}
      <div
        className="fixed bottom-20 sm:bottom-5 right-3 sm:right-5 z-50 flex flex-col gap-2 max-w-sm sm:max-w-md w-[calc(100%-1.5rem)] sm:w-auto pointer-events-none"
        aria-live="polite"
      >
        {toasts.map(toast => {
          let Icon = Info;
          let borderColor = 'border-[#E4E7EF] dark:border-[#1E2638]';
          let iconColor = 'text-[#2E5BFF] dark:text-[#7A9AFF]';

          if (toast.type === 'success') {
            Icon = CheckCircle2;
            borderColor = 'border-[#16A34A]/30 dark:border-[#22C55E]/30';
            iconColor = 'text-[#16A34A] dark:text-[#22C55E]';
          } else if (toast.type === 'error') {
            Icon = AlertCircle;
            borderColor = 'border-[#DC2626]/30 dark:border-[#F87171]/30';
            iconColor = 'text-[#DC2626] dark:text-[#F87171]';
          } else if (toast.type === 'warning') {
            Icon = AlertTriangle;
            borderColor = 'border-[#D97706]/30 dark:border-[#F59E0B]/30';
            iconColor = 'text-[#D97706] dark:text-[#F59E0B]';
          }

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl bg-white/95 dark:bg-[#101521]/95 backdrop-blur-md border ${borderColor} text-[#11162B] dark:text-[#F3F5FA] shadow-lg transition-all duration-150 animate-studio-enter`}
            >
              <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${iconColor}`} />
              <div className="flex-1 min-w-0">
                {toast.title && <div className="text-xs font-bold text-[#11162B] dark:text-[#F3F5FA]">{toast.title}</div>}
                <div className="text-xs text-[#5A6580] dark:text-[#A2ADC7] leading-relaxed">{toast.message}</div>
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="text-[#78839E] hover:text-[#11162B] dark:hover:text-white p-1 rounded-lg hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
