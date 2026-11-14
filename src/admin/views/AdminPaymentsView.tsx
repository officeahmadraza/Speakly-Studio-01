import React, { useEffect, useState, useCallback } from 'react';
import {
  Search,
  CheckCircle2,
  XCircle,
  FileImage,
  Loader2,
  Clock,
  MessageSquare,
} from 'lucide-react';
import { adminApi } from '../api.js';
import { AdminPaymentRecord } from '../types.js';
import { useToast } from '../../context/ToastContext.js';
import { Modal } from '../../components/ui/index.js';

interface AdminPaymentsViewProps {
  globalSearch?: string;
  onPaymentsChanged?: () => void;
}

export const AdminPaymentsView: React.FC<AdminPaymentsViewProps> = ({
  globalSearch = '',
  onPaymentsChanged,
}) => {
  const { showToast } = useToast();
  const [payments, setPayments] = useState<AdminPaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(globalSearch);
  const [statusFilter, setStatusFilter] = useState('all');

  const [receiptPreview, setReceiptPreview] = useState<{
    payment: AdminPaymentRecord;
    dataUrl: string;
  } | null>(null);
  const [approveTarget, setApproveTarget] = useState<AdminPaymentRecord | null>(null);
  const [approveNote, setApproveNote] = useState('');
  const [rejectTarget, setRejectTarget] = useState<AdminPaymentRecord | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectNote, setRejectNote] = useState('');
  const [noteTarget, setNoteTarget] = useState<AdminPaymentRecord | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    setQ(globalSearch);
  }, [globalSearch]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getPayments({ q: q.trim(), status: statusFilter });
      setPayments(res.payments);
    } catch (err: any) {
      showToast(err.message || 'Failed to load payments.', 'error');
    } finally {
      setLoading(false);
    }
  }, [q, statusFilter, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleViewReceipt = async (payment: AdminPaymentRecord) => {
    try {
      const res = await adminApi.getPaymentReceipt(payment.id);
      setReceiptPreview({ payment, dataUrl: res.receipt.dataUrl });
    } catch (err: any) {
      showToast(err.message || 'Receipt could not be loaded.', 'error');
    }
  };

  const handleApproveConfirm = async () => {
    if (!approveTarget) return;
    setProcessing(true);
    try {
      await adminApi.approvePayment(approveTarget.id, approveNote.trim() || undefined);
      showToast(
        `Approved payment ${approveTarget.transactionId}. +${approveTarget.creditsToGrant.toLocaleString()} credits applied.`,
        'success'
      );
      setApproveTarget(null);
      setApproveNote('');
      await load();
      onPaymentsChanged?.();
    } catch (err: any) {
      showToast(err.message || 'Approval failed.', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleRejectConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTarget || !rejectReason.trim()) return;
    setProcessing(true);
    try {
      await adminApi.rejectPayment(
        rejectTarget.id,
        rejectReason.trim(),
        rejectNote.trim() || undefined
      );
      showToast(`Payment ${rejectTarget.transactionId} rejected.`, 'info');
      setRejectTarget(null);
      setRejectReason('');
      setRejectNote('');
      await load();
      onPaymentsChanged?.();
    } catch (err: any) {
      showToast(err.message || 'Rejection failed.', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTarget) return;
    setProcessing(true);
    try {
      await adminApi.updatePaymentNote(noteTarget.id, noteInput.trim());
      showToast('Internal admin note updated.', 'success');
      setNoteTarget(null);
      await load();
    } catch (err: any) {
      showToast(err.message || 'Failed to update note.', 'error');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Filter Bar */}
      <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-[#78839E] dark:text-[#7C87A3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by user email, Transaction ID, or plan..."
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 px-3 rounded-lg bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E4E7EF] dark:border-[#1E2638] bg-[#F7F8FA] dark:bg-[#0D121D] text-[11px] font-semibold text-[#5A6580] dark:text-[#A2ADC7]">
                <th className="py-2.5 px-4">Date</th>
                <th className="py-2.5 px-4">User</th>
                <th className="py-2.5 px-4">Plan &amp; Credits</th>
                <th className="py-2.5 px-4">Method &amp; Tx ID</th>
                <th className="py-2.5 px-4 text-right">Amount</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E7EF] dark:divide-[#1E2638]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[#5A6580] dark:text-[#A2ADC7]">
                    Loading payments...
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[#5A6580] dark:text-[#A2ADC7]">
                    No payment submissions found.
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id} className="hover:bg-[#F7F8FA] dark:hover:bg-[#171E2E]/60 transition-colors">
                    <td className="py-2.5 px-4 font-mono tabular-nums text-[11px] text-[#5A6580] dark:text-[#A2ADC7] whitespace-nowrap">
                      {new Date(p.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-semibold text-[#11162B] dark:text-[#F3F5FA]">{p.userName}</div>
                      <div className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7]">{p.userEmail}</div>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-semibold text-[#2E5BFF] dark:text-[#7A9AFF]">
                        {p.planName} ({p.billingCycle})
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-[#5A6580] dark:text-[#A2ADC7]">
                        +{p.creditsToGrant.toLocaleString()} credits
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-[#11162B] dark:text-[#F3F5FA]">{p.paymentMethod}</div>
                      <div className="text-[11px] font-mono text-[#5A6580] dark:text-[#A2ADC7]">{p.transactionId}</div>
                      {p.adminNote && (
                        <div className="text-[10px] text-[#2E5BFF] dark:text-[#7A9AFF] mt-0.5">Note: {p.adminNote}</div>
                      )}
                      {p.rejectionReason && (
                        <div className="text-[10px] text-[#DC2626] dark:text-[#F87171] mt-0.5">
                          Rejected: {p.rejectionReason}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold">
                      ${p.amountUsd.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      {p.status === 'pending' && (
                        <span className="inline-flex items-center gap-1 text-[#D97706] dark:text-[#F59E0B] text-[11px] font-medium">
                          <Clock className="w-3.5 h-3.5" /> Pending
                        </span>
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
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {p.hasReceipt && (
                          <button
                            type="button"
                            onClick={() => handleViewReceipt(p)}
                            title="View Uploaded Receipt"
                            className="p-1.5 rounded-lg hover:bg-[#EEF2FF] dark:hover:bg-[#171E2E] text-[#2E5BFF] dark:text-[#7A9AFF] cursor-pointer"
                          >
                            <FileImage className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setNoteTarget(p);
                            setNoteInput(p.adminNote || '');
                          }}
                          title="Edit Internal Note"
                          className="p-1.5 rounded-lg hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] text-[#5A6580] dark:text-[#A2ADC7] cursor-pointer"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                        {p.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setApproveTarget(p);
                                setApproveNote(p.adminNote || '');
                              }}
                              className="px-2.5 py-1 rounded-lg bg-[#16A34A] hover:bg-[#15803D] text-white text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectTarget(p);
                                setRejectReason('');
                                setRejectNote(p.adminNote || '');
                              }}
                              className="px-2.5 py-1 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-white text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Receipt Preview Modal */}
      <Modal
        isOpen={Boolean(receiptPreview)}
        onClose={() => setReceiptPreview(null)}
        title="Payment Receipt Screenshot"
        subtitle={
          receiptPreview
            ? `${receiptPreview.payment.userEmail} · Tx ${receiptPreview.payment.transactionId}`
            : ''
        }
        maxWidthClass="max-w-xl"
      >
        {receiptPreview && (
          <div className="space-y-4">
            <div className="rounded-xl overflow-hidden border border-[#E4E7EF] dark:border-[#1E2638] bg-[#090C12] flex justify-center">
              <img
                src={receiptPreview.dataUrl}
                alt="Payment receipt"
                className="max-h-[460px] object-contain"
              />
            </div>
            {receiptPreview.payment.status === 'pending' && (
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const p = receiptPreview.payment;
                    setReceiptPreview(null);
                    setRejectTarget(p);
                  }}
                  className="h-9 px-4 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-medium whitespace-nowrap cursor-pointer"
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const p = receiptPreview.payment;
                    setReceiptPreview(null);
                    setApproveTarget(p);
                  }}
                  className="h-9 px-4 rounded-lg bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-medium whitespace-nowrap cursor-pointer"
                >
                  Approve Payment
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Approve Confirm Modal */}
      <Modal
        isOpen={Boolean(approveTarget)}
        onClose={() => setApproveTarget(null)}
        title="Confirm Payment Approval"
        subtitle={approveTarget ? `Tx ${approveTarget.transactionId} · $${approveTarget.amountUsd}` : ''}
        maxWidthClass="max-w-md"
      >
        {approveTarget && (
          <div className="space-y-4 text-xs">
            <p className="text-[#5A6580] dark:text-[#A2ADC7]">
              Approving this payment will atomically activate{' '}
              <strong className="text-[#11162B] dark:text-[#F3F5FA]">{approveTarget.planName}</strong>{' '}
              and add{' '}
              <strong className="text-[#16A34A] dark:text-[#22C55E] font-mono tabular-nums">
                +{approveTarget.creditsToGrant.toLocaleString()} credits
              </strong>{' '}
              to {approveTarget.userEmail}.
            </p>
            <input
              type="text"
              value={approveNote}
              onChange={(e) => setApproveNote(e.target.value)}
              placeholder="Optional internal verification note"
              className="w-full h-10 px-3 rounded-lg bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setApproveTarget(null)}
                className="h-9 px-4 rounded-lg border border-[#E4E7EF] dark:border-[#1E2638] text-[#5A6580] dark:text-[#A2ADC7] font-medium whitespace-nowrap cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={processing}
                onClick={handleApproveConfirm}
                className="h-9 px-5 rounded-lg bg-[#16A34A] hover:bg-[#15803D] text-white font-medium flex items-center gap-2 whitespace-nowrap cursor-pointer"
              >
                {processing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Approve &amp; Grant Credits</span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reject Confirm Modal */}
      <Modal
        isOpen={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title="Reject Payment Request"
        subtitle={rejectTarget ? `Tx ${rejectTarget.transactionId}` : ''}
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleRejectConfirm} className="space-y-3 text-xs">
          <div>
            <label className="block font-medium text-[#11162B] dark:text-[#F3F5FA] mb-1">Rejection Reason (shown to user) *</label>
            <input
              type="text"
              required
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Transaction ID not found, partial amount paid"
              className="w-full h-10 px-3 rounded-lg bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
            />
          </div>
          <div>
            <label className="block font-medium text-[#11162B] dark:text-[#F3F5FA] mb-1">Internal Admin Note</label>
            <input
              type="text"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setRejectTarget(null)}
              className="h-9 px-4 rounded-lg border border-[#E4E7EF] dark:border-[#1E2638] text-[#5A6580] dark:text-[#A2ADC7] font-medium whitespace-nowrap cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={processing}
              className="h-9 px-5 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-white font-medium flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              {processing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Confirm Rejection</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Note Modal */}
      <Modal
        isOpen={Boolean(noteTarget)}
        onClose={() => setNoteTarget(null)}
        title="Payment Internal Note"
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleSaveNote} className="space-y-4 text-xs">
          <textarea
            rows={3}
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            placeholder="Internal admin verification notes..."
            className="w-full p-3 rounded-lg bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setNoteTarget(null)}
              className="h-9 px-4 rounded-lg border border-[#E4E7EF] dark:border-[#1E2638] text-[#5A6580] dark:text-[#A2ADC7] font-medium whitespace-nowrap cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={processing}
              className="h-9 px-4 rounded-lg bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white font-medium whitespace-nowrap cursor-pointer"
            >
              Save Note
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
