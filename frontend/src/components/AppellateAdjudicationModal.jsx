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
                className="w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border-mid)' }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="appellate-modal-title"
            >
                {/* Header */}
                <div
                    className="flex items-center justify-between px-6 py-4 border-b"
                    style={{ background: 'var(--bg-cta-banner)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                >
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg" style={{ background: 'var(--navy-light)', color: 'var(--navy)' }}>
                            <Scale size={20} />
                        </div>
                        <div>
                            <h2 id="appellate-modal-title" className="text-base font-bold tracking-tight" style={{ color: 'var(--navy)' }}>
                                Appellate Authority Adjudication Desk
                            </h2>
                            <p className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                                {authorityTitle} · Grievance #{complaint.complaint_number || complaint.id?.slice(0, 8)}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        className="p-1.5 rounded-lg transition btn-ghost"
                        aria-label="Close modal"
                    >
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {/* Citizen Appeal Reason Box */}
                    {complaint.appeal_remarks && (
                        <div
                            className="p-3.5 rounded-xl border"
                            style={{ background: 'var(--status-progress-bg)', borderColor: 'var(--status-progress)' }}
                        >
                            <div className="flex items-center gap-1.5 text-xs font-bold mb-1" style={{ color: 'var(--status-progress)' }}>
                                <AlertTriangle size={13} />
                                <span>Citizen Appeal Grounds</span>
                            </div>
                            <p className="text-xs leading-relaxed italic" style={{ color: 'var(--text-primary)' }}>
                                &ldquo;{complaint.appeal_remarks}&rdquo;
                            </p>
                        </div>
                    )}

                    {/* Decision Selector */}
                    <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                            Adjudication Determination
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <label
                                className="flex flex-col p-3 rounded-xl border-2 cursor-pointer transition"
                                style={
                                    decision === 'reopen_rework'
                                        ? { borderColor: 'var(--status-progress)', background: 'var(--status-progress-bg)' }
                                        : { borderColor: 'var(--border)', background: 'var(--bg-section)' }
                                }
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1.5 font-bold text-xs" style={{ color: 'var(--status-progress)' }}>
                                        <RotateCcw size={14} />
                                        <span>Order Field Rework</span>
                                    </div>
                                    <input
                                        type="radio"
                                        name="decision"
                                        value="reopen_rework"
                                        checked={decision === 'reopen_rework'}
                                        onChange={() => setDecision('reopen_rework')}
                                    />
                                </div>
                                <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                    Uphold appeal. Reopens complaint to In Progress with immediate 24h SLA.
                                </span>
                            </label>

                            <label
                                className="flex flex-col p-3 rounded-xl border-2 cursor-pointer transition"
                                style={
                                    decision === 'final_close'
                                        ? { borderColor: 'var(--status-resolved)', background: 'var(--status-resolved-bg)' }
                                        : { borderColor: 'var(--border)', background: 'var(--bg-section)' }
                                }
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1.5 font-bold text-xs" style={{ color: 'var(--status-resolved)' }}>
                                        <CheckCircle size={14} />
                                        <span>Final Closure</span>
                                    </div>
                                    <input
                                        type="radio"
                                        name="decision"
                                        value="final_close"
                                        checked={decision === 'final_close'}
                                        onChange={() => setDecision('final_close')}
                                    />
                                </div>
                                <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                    Dispose appeal. Upholds resolution with binding finality (marks Closed).
                                </span>
                            </label>
                        </div>
                    </div>

                    {/* Order Directive Notes */}
                    <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-xs">
                            <label className="font-bold" style={{ color: 'var(--text-secondary)' }}>
                                Appellate Order Directives & Remarks <span style={{ color: 'var(--status-critical)' }}>*</span>
                            </label>
                            <span
                                className="text-[11px] font-mono"
                                style={{ color: notes.trim().length >= 10 ? 'var(--status-resolved)' : 'var(--text-muted)' }}
                            >
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
                            className="gov-input w-full px-3.5 py-2.5 rounded-xl text-xs transition"
                            required
                        />
                    </div>

                    {/* Error Notice */}
                    {error && (
                        <div className="gov-alert error text-xs">
                            {error}
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={submitting}
                            className="btn-ghost px-4 py-2 rounded-xl text-xs font-semibold transition"
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
