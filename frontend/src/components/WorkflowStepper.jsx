'use client';

import { Check, AlertTriangle } from 'lucide-react';

const STEPS = [
    { key: 'submitted', label: '1. Filed & AI Routed', short: 'Intake' },
    { key: 'inspection_assigned', label: '2. Inspector Assigned', short: 'Inspect' },
    { key: 'inspection_submitted', label: '3. Inspection Review', short: 'Nodal Check' },
    { key: 'inspection_verified', label: '4. Ready for Team', short: 'Verified' },
    { key: 'team_assigned', label: '5. Team Dispatched', short: 'Team' },
    { key: 'work_in_progress', label: '6. Field Redressal', short: 'Repair' },
    { key: 'verification_assigned', label: '7. Post-Repair Check', short: 'Verify' },
    { key: 'resolved', label: '8. Approved & Notified', short: 'Resolved' },
];

function getStepIndex(status) {
    switch (status) {
        case 'submitted':
        case 'verified':
        case 'assigned':
            return 0;
        case 'inspection_assigned':
        case 'inspection_rework':
            return 1;
        case 'inspection_submitted':
            return 2;
        case 'inspection_verified':
            return 3;
        case 'team_assigned':
        case 'redressal_rework':
            return 4;
        case 'work_in_progress':
        case 'in_progress':
        case 'resolution_submitted':
            return 5;
        case 'verification_assigned':
        case 'verification_submitted':
            return 6;
        case 'resolved':
        case 'closed':
            return 7;
        default:
            return 0;
    }
}

export default function WorkflowStepper({ status, compact = false }) {
    const currentIdx = getStepIndex(status);
    const isRework = status === 'inspection_rework' || status === 'redressal_rework';
    const isVerificationSubmitted = status === 'verification_submitted';

    return (
        <div className="w-full">
            <div className="flex items-center justify-between gap-1 overflow-x-auto pb-1">
                {STEPS.map((step, idx) => {
                    const done = idx < currentIdx || (status === 'resolved' || status === 'closed');
                    const active = idx === currentIdx && !(status === 'resolved' || status === 'closed');
                    const awaitingFinal = idx === 7 && isVerificationSubmitted;

                    return (
                        <div key={step.key} className="flex items-center flex-1 min-w-0">
                            <div className="flex flex-col items-center min-w-[54px] flex-1">
                                <div
                                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold tabular-nums border transition-colors ${
                                        done
                                            ? 'bg-[#138808] border-[#138808] text-white'
                                            : active && isRework
                                            ? 'bg-red-600 border-red-600 text-white'
                                            : active || awaitingFinal
                                            ? 'bg-[#003580] border-[#003580] text-white'
                                            : 'bg-(--bg-card) border-(--border-mid) text-(--text-muted)'
                                    }`}
                                >
                                    {done ? (
                                        <Check size={12} strokeWidth={2.5} />
                                    ) : active && isRework ? (
                                        <AlertTriangle size={11} />
                                    ) : (
                                        idx + 1
                                    )}
                                </div>
                                <span
                                    className={`mt-1 text-[10px] text-center leading-tight truncate max-w-[78px] ${
                                        active || awaitingFinal
                                            ? 'font-semibold text-(--text-primary)'
                                            : done
                                            ? 'font-medium text-(--text-secondary)'
                                            : 'text-(--text-muted)'
                                    }`}
                                    title={step.label}
                                >
                                    {compact ? step.short : step.short}
                                </span>
                            </div>
                            {idx < STEPS.length - 1 && (
                                <div
                                    className="h-px flex-1 mx-0.5 -mt-4"
                                    style={{
                                        background: idx < currentIdx ? '#138808' : 'var(--border)',
                                    }}
                                />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
