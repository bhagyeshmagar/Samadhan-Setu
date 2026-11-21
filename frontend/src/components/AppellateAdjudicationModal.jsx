'use client';

import { useState } from 'react';
import { X, Scale, RotateCcw, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { departmentAPI } from '@/lib/api';

/**
 * AppellateAdjudicationModal (H-06 FIX)
 * Replaces window.prompt() with a civic-standard appellate order interface.
 * Strictly validated (min 10 characters order remarks, explicit decision choice).
 */
export default function AppellateAdjudicationModal({
    isOpen,
    onClose,
    complaint,
    onSuccess,
}) {
    const [decision, setDecision] = useState('reopen_rework');
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen || !complaint) return null;

    const appealLevel = complaint.appeal_level || (complaint.status === 'appealed_l2' ? 2 : 1);
    const authorityTitle = appealLevel === 2 ? 'Level 2 Appellate Review' : 'Level 1 Nodal Authority Review';

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        const cleanNotes = notes.trim();
        if (cleanNotes.length < 10) {
            setError('Official appellate order directive must be at least 10 characters long.');
            return;
        }

        setSubmitting(true);
        try {
            await departmentAPI.adjudicateAppeal(complaint.id, decision, cleanNotes);
            onSuccess();
            onClose();
        } catch (err) {
            setError(err.message || 'Failed to submit appellate order.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div
                className="w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800"
                role="dialog"
                aria-modal="true"
                aria-labelledby="appellate-modal-title"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-navy to-navy-dark text-white border-b border-navy-light/20">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-white/10">
                            <Scale size={20} className="text-saffron" />
                        </div>
                        <div>
                            <h2 id="appellate-modal-title" className="text-base font-bold tracking-tight">
                                Appellate Authority Adjudication Desk
                            </h2>
                            <p className="text-[11px] text-white/80 font-medium">
                                {authorityTitle} · Grievance #{complaint.complaint_number || complaint.id?.slice(0, 8)}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition"
                        aria-label="Close modal"
                    >
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {/* Citizen Appeal Reason Box */}
                    {complaint.appeal_remarks && (
                        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 dark:text-amber-200 mb-1">
                                <AlertTriangle size={13} />
                                <span>Citizen Appeal Grounds</span>
                            </div>
                            <p className="text-xs text-amber-950 dark:text-amber-300 leading-relaxed italic">
                                &ldquo;{complaint.appeal_remarks}&rdquo;
                            </p>
                        </div>
                    )}

                    {/* Decision Selector */}
                    <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                            Adjudication Determination
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <label
                                className={`flex flex-col p-3 rounded-xl border-2 cursor-pointer transition ${
                                    decision === 'reopen_rework'
                                        ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20'
                                        : 'border-gray-200 dark:border-gray-800 hover:border-gray-300'
                                }`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1.5 font-bold text-xs text-amber-700 dark:text-amber-400">
                                        <RotateCcw size={14} />
                                        <span>Order Field Rework</span>
                                    </div>
                                    <input
                                        type="radio"
                                        name="decision"
                                        value="reopen_rework"
                                        checked={decision === 'reopen_rework'}
                                        onChange={() => setDecision('reopen_rework')}
                                        className="text-amber-600 focus:ring-amber-500"
                                    />
                                </div>
                                <span className="text-[11px] text-gray-500 dark:text-gray-400">
                                    Uphold appeal. Reopens complaint to In Progress with immediate 24h SLA.
                                </span>
                            </label>

                            <label
                                className={`flex flex-col p-3 rounded-xl border-2 cursor-pointer transition ${
                                    decision === 'final_close'
                                        ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'
                                        : 'border-gray-200 dark:border-gray-800 hover:border-gray-300'
                                }`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-700 dark:text-emerald-400">
                                        <CheckCircle size={14} />
                                        <span>Final Closure</span>
                                    </div>
                                    <input
                                        type="radio"
                                        name="decision"
                                        value="final_close"
                                        checked={decision === 'final_close'}
                                        onChange={() => setDecision('final_close')}
                                        className="text-emerald-600 focus:ring-emerald-500"
                                    />
                                </div>
                                <span className="text-[11px] text-gray-500 dark:text-gray-400">
                                    Dispose appeal. Upholds resolution with binding finality (marks Closed).
                                </span>
                            </label>
                        </div>
                    </div>

                    {/* Order Directive Notes */}
                    <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-xs">
                            <label className="font-bold text-gray-700 dark:text-gray-300">
                                Appellate Order Directives & Remarks <span className="text-red-500">*</span>
                            </label>
                            <span className={`text-[11px] font-mono ${notes.trim().length >= 10 ? 'text-green-600' : 'text-gray-400'}`}>
                                {notes.trim().length} / 10 chars
                            </span>
                        </div>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                            placeholder={
                                decision === 'reopen_rework'
                                    ? 'Specify site deficiencies and instructions for field team re-inspection...'
                                    : 'Specify factual basis and verification evidence for final appellate closure...'
                            }
                            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition"
                            required
                        />
                    </div>

                    {/* Error Notice */}
                    {error && (
                        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs">
                            {error}
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={submitting}
                            className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting || notes.trim().length < 10}
                            className="btn-primary text-xs px-5 py-2.5 flex items-center gap-2 rounded-xl disabled:opacity-50"
                        >
                            {submitting ? (
                                <>
                                    <Loader2 size={14} className="animate-spin" />
                                    <span>Recording Order…</span>
                                </>
                            ) : (
                                <span>Record Official Order</span>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
