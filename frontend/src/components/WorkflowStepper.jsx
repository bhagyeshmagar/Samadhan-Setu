'use client';

import { Check, AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';

const STEPS = [
    { key: 'submitted', shortKey: 'wf_intake' },
    { key: 'inspection_assigned', shortKey: 'wf_inspect' },
    { key: 'inspection_submitted', shortKey: 'wf_nodal_check' },
    { key: 'inspection_verified', shortKey: 'wf_verified' },
    { key: 'team_assigned', shortKey: 'wf_team' },
    { key: 'work_in_progress', shortKey: 'wf_repair' },
    { key: 'verification_assigned', shortKey: 'wf_verify' },
    { key: 'resolved', shortKey: 'wf_resolved' },
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

export default function WorkflowStepper({ status }) {
    const { t } = useLanguage();
    const currentIdx = getStepIndex(status);
    const isRework = status === 'inspection_rework' || status === 'redressal_rework';
    const isVerificationSubmitted = status === 'verification_submitted';

    return (
        <div className="w-full">
            <div className="flex items-center justify-between gap-1 overflow-x-auto pb-1">
                {STEPS.map((step, idx) => {
                    const done = idx < currentIdx || status === 'resolved' || status === 'closed';
                    const active = idx === currentIdx && !(status === 'resolved' || status === 'closed');
                    const awaitingFinal = idx === 7 && isVerificationSubmitted;
                    const label = t(step.shortKey);

                    let circleStyle = {
                        background: 'var(--bg-card)',
                        borderColor: 'var(--border-mid)',
                        color: 'var(--text-muted)',
                    };
                    if (done) {
                        circleStyle = {
                            background: 'var(--india-green)',
                            borderColor: 'var(--india-green)',
                            color: 'var(--primary-ink)',
                        };
                    } else if (active && isRework) {
                        circleStyle = {
                            background: 'var(--error)',
                            borderColor: 'var(--error)',
                            color: '#FFFFFF',
                        };
                    } else if (active || awaitingFinal) {
                        circleStyle = {
                            background: 'var(--navy)',
                            borderColor: 'var(--navy)',
                            color: 'var(--primary-ink)',
                        };
                    }

                    return (
                        <div key={step.key} className="flex items-center flex-1 min-w-0">
                            <div className="flex flex-col items-center min-w-[54px] flex-1">
                                <div
                                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold tabular-nums border transition-colors"
                                    style={circleStyle}
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
                                    className="mt-1 text-[10px] text-center leading-tight truncate max-w-[78px]"
                                    style={{
                                        color: active || awaitingFinal
                                            ? 'var(--text-primary)'
                                            : done
                                                ? 'var(--text-secondary)'
                                                : 'var(--text-muted)',
                                        fontWeight: active || awaitingFinal ? 600 : 500,
                                    }}
                                    title={label}
                                >
                                    {label}
                                </span>
                            </div>
                            {idx < STEPS.length - 1 && (
                                <div
                                    className="h-px flex-1 mx-0.5 -mt-4"
                                    style={{
                                        background: idx < currentIdx ? 'var(--india-green)' : 'var(--border)',
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
