import React, { useState, useEffect } from 'react';
import {
  Upload,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  CreditCard,
  Loader2,
  FileImage,
  Trash2,
} from 'lucide-react';
import { Modal } from './ui/index.js';
import {
  PublicPricingPlan,
  PublicPlatformSettings,
  UserPaymentRequestItem,
  submitPaymentRequest,
  cancelPaymentRequest,
} from '../services/userSyncApi.js';
import { useToast } from '../context/ToastContext.js';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPlan: PublicPricingPlan | null;
  billingCycle: 'monthly' | 'yearly';
  settings: PublicPlatformSettings;
  isSignedIn: boolean;
  onSignIn: () => Promise<void>;
  paymentRequests: UserPaymentRequestItem[];
  onPaymentUpdated: () => Promise<void>;
}

function compressImageToDataUrl(file: File, maxDim = 1280, quality = 0.78): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Failed to decode image file.'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  selectedPlan,
  billingCycle,
  settings,
  isSignedIn,
  onSignIn,
  paymentRequests,
  onPaymentUpdated,
}) => {
  const { showToast } = useToast();
  const [paymentMethod, setPaymentMethod] = useState<string>(
    settings.acceptedPaymentMethods[0] || 'Bank Transfer'
  );
  const [transactionId, setTransactionId] = useState('');
  const [receiptDataUrl, setReceiptDataUrl] = useState<string>('');
  const [receiptFileName, setReceiptFileName] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings.acceptedPaymentMethods.length > 0) {
      setPaymentMethod((prev) =>
        settings.acceptedPaymentMethods.includes(prev) ? prev : settings.acceptedPaymentMethods[0]
      );
    }
  }, [settings.acceptedPaymentMethods]);

  if (!selectedPlan) return null;

  const amountUsd =
    billingCycle === 'yearly' ? selectedPlan.yearlyPrice : selectedPlan.monthlyPrice;
  const creditsToGrant =
    billingCycle === 'yearly' ? selectedPlan.credits * 12 : selectedPlan.credits;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid PNG, JPG, or WEBP receipt screenshot.');
      return;
    }
    try {
      setError(null);
      const compressed = await compressImageToDataUrl(file);
      if (compressed.length > 720_000) {
        const smaller = await compressImageToDataUrl(file, 900, 0.6);
        setReceiptDataUrl(smaller);
      } else {
        setReceiptDataUrl(compressed);
      }
      setReceiptFileName(file.name);
    } catch (err: any) {
      setError(err.message || 'Failed to process receipt image.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSignedIn) {
      await onSignIn();
      return;
    }
    if (!transactionId.trim()) {
      setError('Please enter your Transaction ID / Payment Reference.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await submitPaymentRequest({
        planId: selectedPlan.id,
        billingCycle,
        paymentMethod,
        transactionId: transactionId.trim(),
        receiptDataUrl: receiptDataUrl || undefined,
      });
      showToast(
        'Payment submitted! An administrator will review and credit your account shortly.',
        'success',
        'Payment Submitted'
      );
      setTransactionId('');
      setReceiptDataUrl('');
      setReceiptFileName('');
      await onPaymentUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to submit payment request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async (id: string) => {
    setCancellingId(id);
    try {
      await cancelPaymentRequest(id);
      showToast('Payment request cancelled.', 'info');
      await onPaymentUpdated();
    } catch (err: any) {
      showToast(err.message || 'Could not cancel payment request.', 'error');
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Checkout — ${selectedPlan.name} Plan`}
      subtitle={`${billingCycle === 'yearly' ? 'Annual' : 'Monthly'} billing · ${creditsToGrant.toLocaleString()} synthesis credits`}
      maxWidthClass="max-w-2xl"
    >
      <div className="space-y-5">
        {/* Step 1: Order Summary Banner */}
        <div className="p-4 rounded-xl bg-[#EEF2FF]/70 dark:bg-[#4D74FF]/10 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-[#5A6580] dark:text-[#A2ADC7]">
              01. Selected Package
            </div>
            <div className="font-display text-base font-bold text-[#11162B] dark:text-[#F3F5FA] mt-0.5">
              {selectedPlan.name} ({billingCycle === 'yearly' ? 'Annual' : 'Monthly'})
            </div>
            <div className="text-xs text-[#2E5BFF] dark:text-[#7A9AFF] font-semibold font-mono tabular-nums mt-0.5">
              +{creditsToGrant.toLocaleString()} Credits
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-[#5A6580] dark:text-[#A2ADC7]">Total Due</div>
            <div className="font-display text-2xl font-bold font-mono tabular-nums text-[#11162B] dark:text-[#F3F5FA]">
              ${amountUsd.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Step 2: Admin Payment Instructions */}
        <div className="p-4 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] space-y-1.5">
          <div className="font-display text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA] flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5 text-[#2E5BFF] dark:text-[#7A9AFF]" />
            <span>02. Payment Instructions</span>
          </div>
          <p className="text-xs text-[#5A6580] dark:text-[#A2ADC7] leading-relaxed whitespace-pre-line">
            {settings.paymentInstructions}
          </p>
        </div>

        {!isSignedIn ? (
          <div className="p-5 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] text-center space-y-3">
            <p className="text-xs text-[#5A6580] dark:text-[#A2ADC7]">
              Sign in with Google to link your payment receipt and receive credits directly in your account.
            </p>
            <button
              type="button"
              onClick={onSignIn}
              className="h-9 px-5 rounded-lg bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white text-xs font-medium whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40"
            >
              Sign in with Google to Continue
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="font-display text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA]">
              03. Submit Transaction Reference
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#11162B] dark:text-[#F3F5FA] mb-1.5">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF] focus:ring-2 focus:ring-[#2E5BFF]/15"
                >
                  {settings.acceptedPaymentMethods.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#11162B] dark:text-[#F3F5FA] mb-1.5">
                  Transaction ID / Reference *
                </label>
                <input
                  type="text"
                  required
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  placeholder="e.g. TXN-98421044"
                  className="w-full h-10 px-3 rounded-lg bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-xs font-mono text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:bg-white dark:focus:bg-[#101521] focus:border-[#2E5BFF] dark:focus:border-[#4D74FF] focus:ring-2 focus:ring-[#2E5BFF]/15"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#11162B] dark:text-[#F3F5FA] mb-1.5">
                Upload Payment Receipt Screenshot (Optional, compressed automatically)
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-[#F7F8FA] dark:bg-[#0D121D] border border-dashed border-[#2E5BFF]/45 dark:border-[#4D74FF]/45 hover:border-[#2E5BFF] dark:hover:border-[#4D74FF] text-xs font-medium text-[#2E5BFF] dark:text-[#7A9AFF] whitespace-nowrap cursor-pointer transition-colors duration-150">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{receiptFileName ? 'Replace Receipt' : 'Choose Receipt Image'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>

                {receiptDataUrl && (
                  <div className="flex items-center gap-2.5 p-1.5 pr-3 rounded-lg bg-[#16A34A]/10 text-[#16A34A] dark:text-[#22C55E] text-xs font-medium">
                    <img
                      src={receiptDataUrl}
                      alt="Uploaded payment receipt preview"
                      className="w-8 h-8 rounded-md object-cover border border-[#16A34A]/25 shrink-0"
                    />
                    <div className="flex items-center gap-1.5 min-w-0">
                      <FileImage className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate max-w-[160px]">{receiptFileName || 'Receipt attached'}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setReceiptDataUrl('');
                        setReceiptFileName('');
                      }}
                      className="p-1 hover:text-[#DC2626] dark:hover:text-[#F87171] transition-colors cursor-pointer"
                      aria-label="Remove receipt"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-[#DC2626]/10 border border-[#DC2626]/25 text-xs text-[#DC2626] dark:text-[#F87171] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-4 rounded-lg border border-[#E4E7EF] dark:border-[#1E2638] text-xs font-medium text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-[#F3F5FA] hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="h-9 px-5 rounded-lg bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white text-xs font-medium flex items-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-60 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Submit Payment for Verification</span>
              </button>
            </div>
          </form>
        )}

        {/* Recent User Payment Requests */}
        {isSignedIn && paymentRequests.length > 0 && (
          <div className="pt-4 border-t border-[#E4E7EF] dark:border-[#1E2638] space-y-2.5">
            <div className="font-display text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA]">
              Your Payment Requests
            </div>
            <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
              {paymentRequests.slice(0, 6).map((p) => (
                <div
                  key={p.id}
                  className="p-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-[#11162B] dark:text-[#F3F5FA] truncate">
                      {p.planName} ({p.billingCycle}) · <span className="font-mono tabular-nums">${p.amountUsd}</span>
                    </div>
                    <div className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7] font-mono tabular-nums truncate">
                      Tx: {p.transactionId} · +{p.creditsToGrant.toLocaleString()} credits
                    </div>
                    {p.rejectionReason && (
                      <div className="text-[11px] text-[#DC2626] dark:text-[#F87171] mt-0.5">
                        Reason: {p.rejectionReason}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {p.status === 'pending' && (
                      <>
                        <span className="inline-flex items-center gap-1 text-[#D97706] dark:text-[#F59E0B] text-[11px] font-medium">
                          <Clock className="w-3.5 h-3.5" /> Pending
                        </span>
                        <button
                          type="button"
                          disabled={cancellingId === p.id}
                          onClick={() => handleCancel(p.id)}
                          className="text-[11px] font-medium text-[#DC2626] dark:text-[#F87171] hover:underline cursor-pointer"
                        >
                          {cancellingId === p.id ? 'Cancelling...' : 'Cancel'}
                        </button>
                      </>
                    )}
                    {p.status === 'approved' && (
                      <span className="inline-flex items-center gap-1 text-[#16A34A] dark:text-[#22C55E] text-[11px] font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                      </span>
                    )}
                    {p.status === 'rejected' && (
                      <span className="inline-flex items-center gap-1 text-[#DC2626] dark:text-[#F87171] text-[11px] font-medium">
                        <XCircle className="w-3.5 h-3.5" /> Rejected
                      </span>
                    )}
                    {p.status === 'cancelled' && (
                      <span className="text-[#5A6580] dark:text-[#A2ADC7] text-[11px] font-medium">
                        Cancelled
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
