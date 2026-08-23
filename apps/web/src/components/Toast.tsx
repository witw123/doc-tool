'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration: number = 3000) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none max-w-md">
        {toasts.map((toast) => {
          let Icon = Info;
          let borderColor = 'border-blue-500/30';
          let bgColor = 'bg-slate-900/90';
          let textColor = 'text-blue-400';

          if (toast.type === 'success') {
            Icon = CheckCircle2;
            borderColor = 'border-emerald-500/30';
            textColor = 'text-emerald-400';
          } else if (toast.type === 'error') {
            Icon = AlertCircle;
            borderColor = 'border-rose-500/30';
            textColor = 'text-rose-400';
          } else if (toast.type === 'warning') {
            Icon = AlertTriangle;
            borderColor = 'border-amber-500/30';
            textColor = 'text-amber-400';
          }

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border ${borderColor} ${bgColor} shadow-2xl backdrop-blur-xl text-slate-100 text-sm animate-in slide-in-from-bottom-3 duration-200`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${textColor}`} />
              <span className="flex-1 font-medium">{toast.message}</span>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="text-slate-400 hover:text-white p-0.5 rounded transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
