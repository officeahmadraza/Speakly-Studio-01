import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidthClass?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  maxWidthClass = 'max-w-2xl',
  children,
  footer,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-[#11162B]/55 dark:bg-black/75 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className={`relative w-full ${maxWidthClass} max-h-[90vh] bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl flex flex-col shadow-2xl overflow-hidden animate-studio-enter`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-heading"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-5 sm:px-6 py-4 border-b border-[#E4E7EF] dark:border-[#1E2638]">
          <div className="min-w-0">
            <h2
              id="modal-heading"
              className="font-display text-base sm:text-[17px] font-bold text-[#11162B] dark:text-[#F3F5FA] tracking-tight"
            >
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs text-[#5A6580] dark:text-[#A2ADC7] mt-0.5 leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[36px] min-h-[36px] p-1.5 rounded-xl text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-white hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] transition-colors flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6">{children}</div>

        {footer && (
          <div className="px-5 sm:px-6 py-3.5 border-t border-[#E4E7EF] dark:border-[#1E2638] bg-[#F7F8FA] dark:bg-[#0D121D] flex items-center justify-end gap-2.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
  label?: string;
  description?: string;
  disabled?: boolean;
}

export const Toggle: React.FC<ToggleProps> = ({
  checked,
  onChange,
  id,
  label,
  description,
  disabled = false,
}) => {
  return (
    <label
      htmlFor={id}
      className={`flex items-center justify-between gap-4 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {(label || description) && (
        <div className="min-w-0 flex-1">
          {label && (
            <span className="text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA] block">
              {label}
            </span>
          )}
          {description && (
            <span className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7] block mt-0.5 leading-snug">
              {description}
            </span>
          )}
        </div>
      )}
      <div className="relative inline-flex items-center shrink-0">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-10 h-5.5 bg-[#CFD6E6] dark:bg-[#242D42] rounded-full peer peer-focus-visible:ring-2 peer-focus-visible:ring-[#2E5BFF] peer-focus-visible:ring-offset-2 dark:peer-focus-visible:ring-offset-[#101521] peer-checked:bg-[#2E5BFF] dark:peer-checked:bg-[#4D74FF] transition-colors after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-4 after:w-4 after:shadow-xs after:transition-transform peer-checked:after:translate-x-[18px]" />
      </div>
    </label>
  );
};

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => (
  <div className="py-14 px-6 text-center bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl max-w-xl mx-auto flex flex-col items-center">
    <div className="w-12 h-12 rounded-xl bg-[#EEF2FF] dark:bg-[#4D74FF]/14 border border-[#2E5BFF]/15 dark:border-[#4D74FF]/25 flex items-center justify-center text-[#2E5BFF] dark:text-[#7A9AFF] mb-4">
      {icon}
    </div>
    <h3 className="font-display text-base font-bold text-[#11162B] dark:text-[#F3F5FA]">{title}</h3>
    <p className="text-xs text-[#5A6580] dark:text-[#A2ADC7] mt-1.5 max-w-sm leading-relaxed">
      {description}
    </p>
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div
    className={`p-4 rounded-2xl bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] flex flex-col justify-between h-[188px] ${className}`}
  >
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-xl bg-[#E4E7EF] dark:bg-[#1E2638] shrink-0" />
      <div className="flex-1 space-y-2 pt-0.5">
        <div className="h-3.5 bg-[#E4E7EF] dark:bg-[#1E2638] rounded w-2/3" />
        <div className="h-2.5 bg-[#E4E7EF]/70 dark:bg-[#1E2638]/70 rounded w-1/2" />
      </div>
    </div>
    <div className="space-y-2 my-3">
      <div className="h-2.5 bg-[#E4E7EF]/60 dark:bg-[#1E2638]/60 rounded w-full" />
      <div className="h-2.5 bg-[#E4E7EF]/40 dark:bg-[#1E2638]/40 rounded w-4/5" />
    </div>
    <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#E4E7EF]/70 dark:border-[#1E2638]/70">
      <div className="h-8 bg-[#E4E7EF]/60 dark:bg-[#1E2638]/60 rounded-xl w-24" />
      <div className="h-8 bg-[#E4E7EF]/60 dark:bg-[#1E2638]/60 rounded-xl w-28" />
    </div>
  </div>
);
