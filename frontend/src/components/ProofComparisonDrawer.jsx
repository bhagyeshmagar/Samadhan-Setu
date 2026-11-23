'use client';

import { useState } from 'react';
import {
    X,
    MapPin,
    Clock,
    CheckCircle2,
    RotateCcw,
    UserCheck,
    AlertTriangle,
    ZoomIn,
    ShieldCheck,
    Loader2,
} from 'lucide-react';
import { getImageUrl } from '@/lib/api';
import Badge from './Badge';
import WorkflowStepper from './WorkflowStepper';

function formatCoord(lat, lng) {
    if (lat === null || lat === undefined || lng === null || lng === undefined) return 'Not recorded';
    return `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
}

function getLatestProofForStage(complaint, stage) {
    const records = (complaint?.proof_records || []).filter((r) => r.stage === stage);
    if (records.length > 0) return records[records.length - 1];
    if (stage === 'citizen_proof' && complaint?.attachments?.[0]) {
        return {
            url: complaint.attachments[0],
            uploaded_by_name: complaint.citizen?.name || 'Citizen',
            latitude: complaint.latitude,
            longitude: complaint.longitude,
            distance_meters: 0,
            captured_at: complaint.created_at,
            notes: complaint.description,
        };
    }
    if (stage === 'initial_inspection' && complaint?.inspection_images?.[0]) {
        return {
            url: complaint.inspection_images[0],
            uploaded_by_name: complaint.assigned_inspector_name || 'Inspection Officer',
            latitude: complaint.latitude,
            longitude: complaint.longitude,
            distance_meters: null,
            captured_at: complaint.updated_at,
            notes: '',
        };
    }
    if (stage === 'team_resolution' && complaint?.resolution_proof?.[0]) {
        return {
            url: complaint.resolution_proof[0],
            uploaded_by_name: complaint.assigned_team_lead_name || 'Team Lead',
            latitude: complaint.latitude,
            longitude: complaint.longitude,
            distance_meters: null,
            captured_at: complaint.updated_at,
            notes: complaint.resolution_remarks || '',
        };
    }
    if (stage === 'final_verification' && complaint?.verification_proof?.[0]) {
        return {
            url: complaint.verification_proof[0],
            uploaded_by_name: complaint.verification_inspector_name || 'Inspection Officer',
            latitude: complaint.latitude,
            longitude: complaint.longitude,
            distance_meters: null,
            captured_at: complaint.updated_at,
            notes: '',
        };
    }
    return null;
}

function ProofCard({ title, roleTag, proof, onZoom }) {
    const distanceOk = proof?.distance_meters !== null && proof?.distance_meters !== undefined && proof.distance_meters <= 100;

    return (
        <div
            className="rounded-lg border flex flex-col overflow-hidden"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
            <div
                className="px-3.5 py-2.5 border-b flex items-center justify-between gap-2"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-page)' }}
            >
                <span className="text-xs font-bold text-(--text-primary)">{title}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">
                    {roleTag}
                </span>
            </div>

            {proof ? (
                <div className="p-3.5 flex-1 flex flex-col gap-3">
                    <div
                        className="relative rounded-md overflow-hidden border cursor-pointer group"
                        style={{ borderColor: 'var(--border)' }}
                        onClick={() => onZoom(proof)}
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={getImageUrl(proof.url)}
                            alt={title}
                            className="w-full h-44 object-cover"
                        />
                        <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/70 text-white text-[10px] font-semibold inline-flex items-center gap-1 opacity-90 group-hover:opacity-100">
                            <ZoomIn size={11} />
                            <span>Inspect</span>
                        </div>
                    </div>

                    <div className="space-y-1.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-(--text-muted)">Uploaded by</span>
                            <span className="font-semibold text-(--text-primary) truncate">{proof.uploaded_by_name || 'Official'}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-(--text-muted) inline-flex items-center gap-1">
                                <MapPin size={11} /> GPS Pin
                            </span>
                            <span className="font-mono text-[11px] tabular-nums text-(--text-primary)">
                                {formatCoord(proof.latitude, proof.longitude)}
                            </span>
                        </div>
                        {proof.distance_meters !== null && proof.distance_meters !== undefined && (
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-(--text-muted)">Offset from Citizen</span>
                                <span
                                    className={`font-mono text-[11px] font-semibold tabular-nums ${
                                        proof.distance_meters === 0
                                            ? 'text-(--text-secondary)'
                                            : distanceOk
                                            ? 'text-[#138808]'
                                            : 'text-amber-600'
                                    }`}
                                >
                                    {proof.distance_meters === 0 ? 'Origin pin (0m)' : `${proof.distance_meters}m away`}
                                </span>
                            </div>
                        )}
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-(--text-muted) inline-flex items-center gap-1">
                                <Clock size={11} /> Captured
                            </span>
                            <span className="text-[11px] tabular-nums text-(--text-secondary)">
                                {proof.captured_at ? new Date(proof.captured_at).toLocaleString() : '—'}
                            </span>
                        </div>
                    </div>

                    {proof.notes && (
                        <div
                            className="mt-auto p-2.5 rounded border text-xs text-(--text-secondary) leading-relaxed"
                            style={{ background: 'var(--bg-page)', borderColor: 'var(--border)' }}
                        >
                            <span className="block text-[10px] uppercase tracking-wider font-semibold text-(--text-muted) mb-0.5">
                                Remarks / ATR
                            </span>
                            {proof.notes}
                        </div>
                    )}
                </div>
            ) : (
                <div className="p-8 text-center text-xs text-(--text-muted)">
                    No proof artifact recorded for this stage yet.
                </div>
            )}
        </div>
    );
}

export default function ProofComparisonDrawer({
    complaint,
    mode = 'initial_inspection', // 'initial_inspection' | 'final_approval' | 'readonly'
    inspectors = [],
    teams = [],
    submitting = false,
    onDecision,
    onClose,
}) {
    const [actionMode, setActionMode] = useState('approve'); // approve | rework | reassign | reverify
    const [notes, setNotes] = useState('');
    const [selectedInspectorId, setSelectedInspectorId] = useState(
        inspectors.find((i) => i.id !== complaint?.assigned_inspector_id)?.id || inspectors[0]?.id || ''
    );
    const [selectedTeamId, setSelectedTeamId] = useState(
        teams.find((t) => t.id !== complaint?.assigned_team_id)?.id || teams[0]?.id || ''
    );
    const [zoomedProof, setZoomedProof] = useState(null);
    const [localError, setLocalError] = useState('');

    if (!complaint) return null;

    const citizenProof = getLatestProofForStage(complaint, 'citizen_proof');
    const inspectionProof = getLatestProofForStage(complaint, 'initial_inspection');
    const resolutionProof = getLatestProofForStage(complaint, 'team_resolution');
    const verificationProof = getLatestProofForStage(complaint, 'final_verification');

    const handleConfirm = async (e) => {
        e.preventDefault();
        setLocalError('');

        if (mode === 'initial_inspection') {
            if (actionMode === 'rework' && !notes.trim()) {
                setLocalError('Please specify what needs to be re-inspected.');
                return;
            }
            if (actionMode === 'reassign' && !selectedInspectorId) {
                setLocalError('Select an Inspection Officer to reassign.');
                return;
            }
            await onDecision({
                decision: actionMode,
                notes: notes.trim(),
                reassign_inspector_id: actionMode === 'reassign' ? selectedInspectorId : undefined,
            });
            return;
        }

        if (mode === 'final_approval') {
            if (actionMode === 'rework_team' && !notes.trim()) {
                setLocalError('Please specify rework instructions for the field team.');
                return;
            }
            if (actionMode === 'reassign_team' && !selectedTeamId) {
                setLocalError('Select a Field Team to reassign.');
                return;
            }
            await onDecision({
                decision: actionMode,
                notes: notes.trim(),
                reassign_team_id: actionMode === 'reassign_team' ? selectedTeamId : undefined,
                reassign_inspector_id: actionMode === 'reverify' ? selectedInspectorId : undefined,
            });
        }
    };

    const isFinalMode = mode === 'final_approval';

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-[2px] overflow-y-auto"
            role="dialog"
            aria-modal="true"
        >
            <div
                className="w-full max-w-5xl rounded-xl border shadow-2xl overflow-hidden my-6 flex flex-col max-h-[92vh]"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
                {/* Header */}
                <div
                    className="px-5 py-4 border-b flex items-start justify-between gap-4 shrink-0"
                    style={{ borderColor: 'var(--border)', background: 'var(--bg-page)' }}
                >
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-(--text-muted)">
                            <span className="font-mono font-bold text-(--navy)">{complaint.complaint_number}</span>
                            <span>·</span>
                            <span>{complaint.ward}</span>
                            <span>·</span>
                            <Badge status={complaint.status} size="small" />
                        </div>
                        <h2 className="text-base font-bold text-(--text-primary) mt-1 truncate">
                            {isFinalMode
                                ? 'Step 8: Final Side-by-Side Proof Verification & Citizen Notification'
                                : mode === 'initial_inspection'
                                ? 'Step 4: Side-by-Side Initial Inspection Verification'
                                : 'Grievance Evidence Audit Trail'}
                        </h2>
                        <p className="text-xs text-(--text-secondary) mt-0.5 truncate">
                            {complaint.title} — {complaint.location}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 rounded-md border text-(--text-secondary) hover:bg-(--bg-card)"
                        style={{ borderColor: 'var(--border)' }}
                        aria-label="Close comparison drawer"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Scrollable Body */}
                <div className="p-5 overflow-y-auto space-y-5 flex-1">
                    <WorkflowStepper status={complaint.status} compact />

                    {/* Side-by-Side Proof Cards */}
                    <div className={`grid gap-4 ${isFinalMode ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'}`}>
                        <ProofCard
                            title="1. Citizen Grievance Proof"
                            roleTag="Step 1 · Citizen"
                            proof={citizenProof}
                            onZoom={setZoomedProof}
                        />
                        {!isFinalMode && (
                            <ProofCard
                                title="2. Initial Site Inspection Proof"
                                roleTag="Step 3 · Inspector"
                                proof={inspectionProof}
                                onZoom={setZoomedProof}
                            />
                        )}
                        {isFinalMode && (
                            <>
                                <ProofCard
                                    title="2. Field Team Resolution Proof"
                                    roleTag="Step 6 · Team Lead"
                                    proof={resolutionProof}
                                    onZoom={setZoomedProof}
                                />
                                <ProofCard
                                    title="3. Post-Repair Site Verification"
                                    roleTag="Step 7 · Inspector"
                                    proof={verificationProof}
                                    onZoom={setZoomedProof}
                                />
                            </>
                        )}
                    </div>

                    {/* Nodal Officer Action Form */}
                    {mode !== 'readonly' && onDecision && (
                        <form
                            onSubmit={handleConfirm}
                            className="rounded-lg border p-4 space-y-4"
                            style={{ background: 'var(--bg-page)', borderColor: 'var(--border)' }}
                        >
                            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-(--text-primary)">
                                <ShieldCheck size={15} className="text-(--navy)" />
                                <span>Nodal Officer Verification Decision</span>
                            </div>

                            {localError && (
                                <div className="p-2.5 rounded border border-red-200 bg-red-50 text-red-700 text-xs flex items-center gap-2">
                                    <AlertTriangle size={14} className="shrink-0" />
                                    <span>{localError}</span>
                                </div>
                            )}

                            {/* Decision Option Buttons */}
                            {mode === 'initial_inspection' ? (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setActionMode('approve')}
                                        className={`p-3 rounded-md border text-left transition-colors ${
                                            actionMode === 'approve'
                                                ? 'border-[#138808] bg-[#E8F5E9] text-[#0A6B05]'
                                                : 'border-(--border) bg-(--bg-card) text-(--text-secondary)'
                                        }`}
                                    >
                                        <div className="flex items-center gap-1.5 text-xs font-bold">
                                            <CheckCircle2 size={14} /> Confirm Inspection
                                        </div>
                                        <p className="text-[11px] mt-0.5 opacity-80">Proofs match — proceed to team dispatch</p>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActionMode('rework')}
                                        className={`p-3 rounded-md border text-left transition-colors ${
                                            actionMode === 'rework'
                                                ? 'border-red-600 bg-red-50 text-red-700'
                                                : 'border-(--border) bg-(--bg-card) text-(--text-secondary)'
                                        }`}
                                    >
                                        <div className="flex items-center gap-1.5 text-xs font-bold">
                                            <RotateCcw size={14} /> Return for Rework
                                        </div>
                                        <p className="text-[11px] mt-0.5 opacity-80">Send back to {complaint.assigned_inspector_name || 'Inspector'}</p>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActionMode('reassign')}
                                        className={`p-3 rounded-md border text-left transition-colors ${
                                            actionMode === 'reassign'
                                                ? 'border-[#003580] bg-[#EEF3FB] text-[#003580]'
                                                : 'border-(--border) bg-(--bg-card) text-(--text-secondary)'
                                        }`}
                                    >
                                        <div className="flex items-center gap-1.5 text-xs font-bold">
                                            <UserCheck size={14} /> Reassign Inspector
                                        </div>
                                        <p className="text-[11px] mt-0.5 opacity-80">Dispatch a different Inspection Officer</p>
                                    </button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setActionMode('approve')}
                                        className={`p-3 rounded-md border text-left transition-colors ${
                                            actionMode === 'approve'
                                                ? 'border-[#138808] bg-[#E8F5E9] text-[#0A6B05]'
                                                : 'border-(--border) bg-(--bg-card) text-(--text-secondary)'
                                        }`}
                                    >
                                        <div className="flex items-center gap-1.5 text-xs font-bold">
                                            <CheckCircle2 size={14} /> Approve & Notify
                                        </div>
                                        <p className="text-[11px] mt-0.5 opacity-80">Mark Resolved & alert Citizen</p>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActionMode('rework_team')}
                                        className={`p-3 rounded-md border text-left transition-colors ${
                                            actionMode === 'rework_team'
                                                ? 'border-red-600 bg-red-50 text-red-700'
                                                : 'border-(--border) bg-(--bg-card) text-(--text-secondary)'
                                        }`}
                                    >
                                        <div className="flex items-center gap-1.5 text-xs font-bold">
                                            <RotateCcw size={14} /> Rework by Team
                                        </div>
                                        <p className="text-[11px] mt-0.5 opacity-80">Return to current Field Team</p>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActionMode('reassign_team')}
                                        className={`p-3 rounded-md border text-left transition-colors ${
                                            actionMode === 'reassign_team'
                                                ? 'border-[#003580] bg-[#EEF3FB] text-[#003580]'
                                                : 'border-(--border) bg-(--bg-card) text-(--text-secondary)'
                                        }`}
                                    >
                                        <div className="flex items-center gap-1.5 text-xs font-bold">
                                            <UserCheck size={14} /> Reassign Team
                                        </div>
                                        <p className="text-[11px] mt-0.5 opacity-80">Assign a different Field Team</p>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActionMode('reverify')}
                                        className={`p-3 rounded-md border text-left transition-colors ${
                                            actionMode === 'reverify'
                                                ? 'border-amber-600 bg-amber-50 text-amber-800'
                                                : 'border-(--border) bg-(--bg-card) text-(--text-secondary)'
                                        }`}
                                    >
                                        <div className="flex items-center gap-1.5 text-xs font-bold">
                                            <MapPin size={14} /> Re-verify Site
                                        </div>
                                        <p className="text-[11px] mt-0.5 opacity-80">Order fresh Inspector visit</p>
                                    </button>
                                </div>
                            )}

                            {/* Reassignment Dropdown when applicable */}
                            {((mode === 'initial_inspection' && actionMode === 'reassign') ||
                                (mode === 'final_approval' && actionMode === 'reverify')) && (
                                <div>
                                    <label className="block text-xs font-semibold text-(--text-primary) mb-1">
                                        Select Inspection Officer
                                    </label>
                                    <select
                                        value={selectedInspectorId}
                                        onChange={(e) => setSelectedInspectorId(e.target.value)}
                                        className="w-full px-3 py-2 text-xs rounded-md border"
                                        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-mid)', color: 'var(--text-primary)' }}
                                    >
                                        {inspectors.map((insp) => (
                                            <option key={insp.id} value={insp.id}>
                                                {insp.name} ({insp.employee_id}) — {insp.active_inspections ?? 0} active tasks
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {mode === 'final_approval' && actionMode === 'reassign_team' && (
                                <div>
                                    <label className="block text-xs font-semibold text-(--text-primary) mb-1">
                                        Select Replacement Field Team
                                    </label>
                                    <select
                                        value={selectedTeamId}
                                        onChange={(e) => setSelectedTeamId(e.target.value)}
                                        className="w-full px-3 py-2 text-xs rounded-md border"
                                        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-mid)', color: 'var(--text-primary)' }}
                                    >
                                        {teams.map((t) => (
                                            <option key={t.id} value={t.id}>
                                                {t.name} ({t.code}) · Lead: {t.team_lead_name} ({t.active_work_orders ?? 0}/{t.daily_capacity})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Remarks */}
                            <div>
                                <label className="block text-xs font-semibold text-(--text-primary) mb-1">
                                    Official Remarks {(actionMode === 'rework' || actionMode === 'rework_team') && <span className="text-red-500">*</span>}
                                </label>
                                <textarea
                                    rows={2}
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder={
                                        actionMode === 'approve'
                                            ? 'Optional sign-off note (e.g., Photos and GPS coordinates verified within tolerance).'
                                            : 'Specify reason for rework or reassignment so the officer/team knows exactly what to fix...'
                                    }
                                    className="w-full px-3 py-2 text-xs rounded-md border resize-none"
                                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border-mid)', color: 'var(--text-primary)' }}
                                />
                            </div>

                            <div className="flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-3.5 py-2 text-xs font-semibold rounded-md border whitespace-nowrap"
                                    style={{ borderColor: 'var(--border-mid)', color: 'var(--text-secondary)', background: 'var(--bg-card)' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md text-white whitespace-nowrap disabled:opacity-60"
                                    style={{
                                        background:
                                            actionMode === 'approve'
                                                ? '#138808'
                                                : actionMode === 'rework' || actionMode === 'rework_team'
                                                ? '#DC2626'
                                                : '#003580',
                                    }}
                                >
                                    {submitting && <Loader2 size={13} className="animate-spin" />}
                                    <span>
                                        {submitting
                                            ? 'Processing…'
                                            : actionMode === 'approve'
                                            ? isFinalMode
                                                ? 'Approve Resolution & Notify Citizen'
                                                : 'Confirm Inspection Proof'
                                            : actionMode === 'rework' || actionMode === 'rework_team'
                                            ? 'Send Back for Rework'
                                            : actionMode === 'reverify'
                                            ? 'Order Re-Verification'
                                            : 'Confirm Reassignment'}
                                    </span>
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>

            {/* Lightbox Zoom Overlay */}
            {zoomedProof && (
                <div
                    className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-6"
                    onClick={() => setZoomedProof(null)}
                >
                    <div className="max-w-3xl w-full space-y-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between text-white text-xs">
                            <span className="font-semibold">
                                {zoomedProof.uploaded_by_name} · GPS: {formatCoord(zoomedProof.latitude, zoomedProof.longitude)}
                            </span>
                            <button
                                type="button"
                                onClick={() => setZoomedProof(null)}
                                className="p-1.5 rounded bg-white/10 hover:bg-white/20"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={getImageUrl(zoomedProof.url)}
                            alt="Zoomed proof"
                            className="w-full max-h-[75vh] object-contain rounded-lg border border-white/20 bg-black"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
