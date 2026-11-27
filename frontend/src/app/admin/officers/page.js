'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/lib/i18n';
import { adminAPI } from '@/lib/api';
import {
    Users, Plus, Edit2, Trash2, X, Check, AlertTriangle,
    Loader2, ChevronRight, Search, Building2, Shield,
    UserCheck, UserX, RefreshCw,
} from 'lucide-react';

/* ── Modal wrapper ── */
function Modal({ title, onClose, children }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
            <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-mid)' }}>
                <div className="flex items-center justify-between px-6 py-4"
                    style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-section)' }}>
                    <h2 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>{title}</h2>
                    <button onClick={onClose} className="btn-ghost p-1 rounded-lg">
                        <X size={18} />
                    </button>
                </div>
                <div className="p-6">{children}</div>
            </div>
        </div>
    );
}

/* ── Field component ── */
function Field({ label, children, required }) {
    return (
        <div>
            <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}>
                {label}{required && <span style={{ color: 'var(--status-critical)' }}> *</span>}
            </label>
            {children}
        </div>
    );
}

const ROLE_OPTIONS = [
    { value: 'nodal_officer', label: 'Nodal Officer (Department Coordinator)' },
    { value: 'inspection_officer', label: 'Inspection Officer (Field Site Verifier)' },
    { value: 'team_lead', label: 'Team Lead (Field Redressal Squad)' },
    { value: 'supervisor', label: 'Appellate Supervisor' },
];

const ROLE_BADGE_MAP = {
    nodal_officer: { bg: 'var(--saffron-light)', color: 'var(--text-saffron)' },
    inspection_officer: { bg: 'var(--navy-light)', color: 'var(--text-navy)' },
    team_lead: { bg: 'var(--india-green-light)', color: 'var(--text-green)' },
    supervisor: { bg: 'var(--status-progress-bg)', color: 'var(--status-progress)' },
    officer: { bg: 'var(--navy-light)', color: 'var(--text-navy)' },
};

/* ── Create Officer Modal ── */
function CreateOfficerModal({ departments, teams, onClose, onCreated }) {
    const [form, setForm] = useState({
        name: '', email: '', password: '', phone: '',
        department_id: '', employee_id: '', designation: '',
        role: 'inspection_officer', team_id: '',
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const deptTeams = teams.filter(t => !form.department_id || t.department_id === form.department_id);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!form.name || !form.email || !form.password || !form.department_id || !form.employee_id) {
            setError('Please fill all required fields.');
            return;
        }
        setLoading(true);
        try {
            const payload = {
                ...form,
                team_id: form.role === 'team_lead' && form.team_id ? form.team_id : undefined,
            };
            const officer = await adminAPI.createOfficer(payload);
            onCreated(officer);
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const inputStyle = {
        width: '100%', padding: '8px 12px', borderRadius: '8px',
        border: '1px solid var(--border-mid)',
        background: 'var(--bg-section)', color: 'var(--text-primary)',
        fontSize: '13px', outline: 'none',
    };

    return (
        <Modal title="Add New Departmental Officer" onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="gov-alert error text-sm flex gap-2">
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {error}
                    </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Full Name" required>
                        <input style={inputStyle} placeholder="Sneha Kulkarni"
                            value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                    </Field>
                    <Field label="Employee ID" required>
                        <input style={inputStyle} placeholder="INSP-ROADS-003"
                            value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))} />
                    </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Officer Role" required>
                        <select style={inputStyle} value={form.role}
                            onChange={e => setForm(f => ({ ...f, role: e.target.value, team_id: '' }))}>
                            {ROLE_OPTIONS.map(r => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Department" required>
                        <select style={inputStyle} value={form.department_id}
                            onChange={e => setForm(f => ({ ...f, department_id: e.target.value, team_id: '' }))}>
                            <option value="">Select department…</option>
                            {departments.map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                    </Field>
                </div>
                {form.role === 'team_lead' && (
                    <Field label="Assigned Field Team">
                        <select style={inputStyle} value={form.team_id}
                            onChange={e => setForm(f => ({ ...f, team_id: e.target.value }))}>
                            <option value="">Assign later from Departments → Field Teams</option>
                            {deptTeams.map(t => (
                                <option key={t.id} value={t.id}>{t.name} ({t.code})</option>
                            ))}
                        </select>
                    </Field>
                )}
                <Field label="Email Address" required>
                    <input style={inputStyle} type="email" placeholder="inspector3@roads.gov.in"
                        value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Password" required>
                        <input style={inputStyle} type="password" placeholder="Min. 6 characters"
                            value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                    </Field>
                    <Field label="Phone">
                        <input style={inputStyle} placeholder="+91 98765 43210"
                            value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                    </Field>
                </div>
                <Field label="Designation">
                    <input style={inputStyle} placeholder="Junior Field Inspector (Zone C)"
                        value={form.designation} onChange={e => setForm(f => ({ ...f, designation: e.target.value }))} />
                </Field>
                <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={onClose} className="btn-ghost text-sm px-4 py-2">
                        Cancel
                    </button>
                    <button type="submit" disabled={loading}
                        className="flex items-center gap-2 text-sm px-5 py-2 rounded-lg font-semibold"
                        style={{ background: 'var(--navy)', color: 'var(--primary-ink)', opacity: loading ? 0.7 : 1 }}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                        {loading ? 'Creating…' : 'Create Officer'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

/* ── Edit Officer Modal ── */
function EditOfficerModal({ officer, departments, teams, onClose, onUpdated }) {
    const [designation, setDesignation] = useState(officer.designation || '');
    const [departmentId, setDepartmentId] = useState(officer.department_id || '');
    const [role, setRole] = useState(officer.role || officer.officer_role || 'inspection_officer');
    const [teamId, setTeamId] = useState(officer.team_id || '');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const deptTeams = teams.filter(t => !departmentId || t.department_id === departmentId);

    const inputStyle = {
        width: '100%', padding: '8px 12px', borderRadius: '8px',
        border: '1px solid var(--border-mid)',
        background: 'var(--bg-section)', color: 'var(--text-primary)',
        fontSize: '13px', outline: 'none',
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const updated = await adminAPI.updateOfficer(officer.id, {
                designation,
                department_id: departmentId || undefined,
                role,
                team_id: role === 'team_lead' ? teamId : '',
            });
            onUpdated(updated);
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal title={`Edit — ${officer.name}`} onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="gov-alert error text-sm flex gap-2">
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {error}
                    </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Officer Role">
                        <select style={inputStyle} value={role} onChange={e => setRole(e.target.value)}>
                            {ROLE_OPTIONS.map(r => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Department">
                        <select style={inputStyle} value={departmentId}
                            onChange={e => setDepartmentId(e.target.value)}>
                            <option value="">No department</option>
                            {departments.map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                    </Field>
                </div>
                {role === 'team_lead' && (
                    <Field label="Assigned Field Team">
                        <select style={inputStyle} value={teamId} onChange={e => setTeamId(e.target.value)}>
                            <option value="">Unassigned</option>
                            {deptTeams.map(t => (
                                <option key={t.id} value={t.id}>{t.name} ({t.code})</option>
                            ))}
                        </select>
                    </Field>
                )}
                <Field label="Designation">
                    <input style={inputStyle} placeholder="Field Inspector"
                        value={designation} onChange={e => setDesignation(e.target.value)} />
                </Field>
                <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={onClose} className="btn-ghost text-sm px-4 py-2">Cancel</button>
                    <button type="submit" disabled={loading}
                        className="flex items-center gap-2 text-sm px-5 py-2 rounded-lg font-semibold"
                        style={{ background: 'var(--navy)', color: 'var(--primary-ink)', opacity: loading ? 0.7 : 1 }}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        {loading ? 'Saving…' : 'Save Changes'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

/* ── Confirm Deactivate Modal ── */
function ConfirmModal({ officer, onClose, onConfirm }) {
    const [loading, setLoading] = useState(false);

    const handleConfirm = async () => {
        setLoading(true);
        await onConfirm();
        setLoading(false);
    };

    return (
        <Modal title="Confirm Deactivation" onClose={onClose}>
            <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-xl"
                    style={{ background: 'var(--status-critical-bg)', border: '1px solid var(--status-critical)' }}>
                    <AlertTriangle size={18} style={{ color: 'var(--status-critical)' }} className="shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                            Deactivate {officer.name}?
                        </p>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                            The officer will lose access to the system. This can be reversed by an admin.
                        </p>
                    </div>
                </div>
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="btn-ghost text-sm px-4 py-2">Cancel</button>
                    <button onClick={handleConfirm} disabled={loading}
                        className="flex items-center gap-2 text-sm px-5 py-2 rounded-lg font-semibold"
                        style={{ background: 'var(--status-critical)', color: 'white', opacity: loading ? 0.7 : 1 }}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        {loading ? 'Deactivating…' : 'Yes, Deactivate'}
                    </button>
                </div>
            </div>
        </Modal>
    );
}

/* ── Main page ── */
export default function OfficersManagementPage() {
    const { user, loading: authLoading } = useAuth();
    const { t, tRole } = useLanguage();
    const router = useRouter();

    const [officers, setOfficers] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [teams, setTeams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [deptFilter, setDeptFilter] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [editOfficer, setEditOfficer] = useState(null);
    const [deleteOfficer, setDeleteOfficer] = useState(null);

    useEffect(() => {
        if (!authLoading && (!user || (user.role !== 'admin' && user.role !== 'super_admin'))) router.push('/login');
    }, [user, authLoading, router]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [officersData, deptsData, teamsData] = await Promise.all([
                adminAPI.getOfficers(deptFilter || undefined, roleFilter || undefined),
                adminAPI.getDepartments(),
                adminAPI.getTeams(),
            ]);
            setOfficers(Array.isArray(officersData) ? officersData : []);
            setDepartments(Array.isArray(deptsData) ? deptsData : []);
            setTeams(Array.isArray(teamsData) ? teamsData : []);
        } catch (err) {
            setError(err.message || 'Failed to load data');
        } finally {
            setLoading(false);
        }
    }, [deptFilter, roleFilter]);

    useEffect(() => {
        if (user?.role === 'admin' || user?.role === 'super_admin') {
            let cancelled = false;
            async function run() {
                if (!cancelled) await fetchData();
            }
            run();
            return () => { cancelled = true; };
        }
    }, [fetchData, user]);

    const handleDeactivate = async () => {
        try {
            await adminAPI.deleteOfficer(deleteOfficer.id);
            setOfficers(prev => prev.map(o => o.id === deleteOfficer.id ? { ...o, is_active: false } : o));
            setDeleteOfficer(null);
        } catch (err) {
            setError(err.message);
            setDeleteOfficer(null);
        }
    };

    const filtered = officers.filter(o => {
        const q = search.toLowerCase();
        return (
            o.name?.toLowerCase().includes(q) ||
            o.email?.toLowerCase().includes(q) ||
            o.employee_id?.toLowerCase().includes(q) ||
            o.designation?.toLowerCase().includes(q) ||
            o.team_name?.toLowerCase().includes(q)
        );
    });

    if (authLoading || (loading && officers.length === 0)) {
        return (
            <div className="flex justify-center items-center h-[60vh]">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="animate-spin" size={32} style={{ color: 'var(--navy)' }} />
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('loading_officers')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto py-6">
            {/* Modals */}
            {showCreate && (
                <CreateOfficerModal
                    departments={departments}
                    teams={teams}
                    onClose={() => setShowCreate(false)}
                    onCreated={() => fetchData()}
                />
            )}
            {editOfficer && (
                <EditOfficerModal
                    officer={editOfficer}
                    departments={departments}
                    teams={teams}
                    onClose={() => setEditOfficer(null)}
                    onUpdated={() => {
                        setEditOfficer(null);
                        fetchData();
                    }}
                />
            )}
            {deleteOfficer && (
                <ConfirmModal
                    officer={deleteOfficer}
                    onClose={() => setDeleteOfficer(null)}
                    onConfirm={handleDeactivate}
                />
            )}

            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <div className="breadcrumb mb-2">
                        <span>{t('admin_oversight')}</span>
                        <ChevronRight size={10} className="breadcrumb-sep" />
                        <span className="breadcrumb-current">{t('officers')}</span>
                    </div>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--navy)' }}>
                        {t('officers_mgmt_title')}
                    </h1>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {t('officers_mgmt_sub')}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={fetchData} className="btn-ghost flex items-center gap-1.5 text-xs">
                        <RefreshCw size={13} /> {t('refresh')}
                    </button>
                    <button
                        onClick={() => setShowCreate(true)}
                        className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl font-semibold"
                        style={{ background: 'var(--navy)', color: 'var(--primary-ink)' }}>
                        <Plus size={15} /> {t('add_officer')}
                    </button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="gov-alert error mb-4 flex gap-2">
                    <AlertTriangle size={15} className="shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Filters */}
            <div className="gov-section mb-5">
                <div className="p-4 flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2"
                            style={{ color: 'var(--text-muted)' }} />
                        <input
                            className="w-full pl-9 pr-4 py-2 rounded-lg text-sm"
                            style={{
                                border: '1px solid var(--border-mid)',
                                background: 'var(--bg-section)',
                                color: 'var(--text-primary)',
                                outline: 'none',
                            }}
                            placeholder={t('search_officers_placeholder')}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <select
                        className="py-2 px-3 rounded-lg text-sm"
                        style={{
                            border: '1px solid var(--border-mid)',
                            background: 'var(--bg-section)',
                            color: 'var(--text-primary)',
                            outline: 'none',
                            minWidth: '170px',
                        }}
                        value={roleFilter}
                        onChange={e => setRoleFilter(e.target.value)}>
                        <option value="">{t('all_roles')}</option>
                        <option value="nodal_officer">{tRole('nodal_officer')}</option>
                        <option value="inspection_officer">{tRole('inspection_officer')}</option>
                        <option value="team_lead">{tRole('team_lead')}</option>
                        <option value="supervisor">{tRole('supervisor')}</option>
                    </select>
                    <select
                        className="py-2 px-3 rounded-lg text-sm"
                        style={{
                            border: '1px solid var(--border-mid)',
                            background: 'var(--bg-section)',
                            color: 'var(--text-primary)',
                            outline: 'none',
                            minWidth: '180px',
                        }}
                        value={deptFilter}
                        onChange={e => setDeptFilter(e.target.value)}>
                        <option value="">{t('all_departments')}</option>
                        {departments.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4 mb-5">
                {[
                    { label: t('total_officers'), val: officers.length, color: 'var(--navy)', icon: <Users size={18}/> },
                    { label: t('active'), val: officers.filter(o => o.is_active).length, color: 'var(--india-green)', icon: <UserCheck size={18}/> },
                    { label: t('inactive'), val: officers.filter(o => !o.is_active).length, color: 'var(--text-muted)', icon: <UserX size={18}/> },
                ].map(s => (
                    <div key={s.label} className="gov-card p-4 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                            style={{ background: 'var(--bg-section)', color: s.color }}>
                            {s.icon}
                        </div>
                        <div>
                            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.val}</div>
                            <div className="text-[11px] font-medium uppercase tracking-wide"
                                style={{ color: 'var(--text-muted)' }}>{s.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Table */}
            <div className="gov-section">
                <div className="gov-section-header">
                    <span className="gov-section-title flex items-center gap-2">
                        <Shield size={12} /> {t('officers')} ({filtered.length})
                    </span>
                </div>
                {filtered.length === 0 ? (
                    <div className="flex flex-col items-center py-16 gap-3">
                        <Users size={36} style={{ color: 'var(--border-mid)' }} />
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                            {search ? t('no_officers_match') : t('no_officers_found')}
                        </p>
                        <button onClick={() => setShowCreate(true)}
                            className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl font-semibold mt-2"
                            style={{ background: 'var(--navy)', color: 'var(--primary-ink)' }}>
                            <Plus size={14} /> {t('add_first_officer')}
                        </button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="gov-table">
                            <thead>
                                <tr>
                                    <th>{t('col_officer')}</th>
                                    <th>{t('col_role_team')}</th>
                                    <th>{t('col_employee_id')}</th>
                                    <th>{t('department')}</th>
                                    <th>{t('col_designation')}</th>
                                    <th>{t('col_workload')}</th>
                                    <th>{t('col_status')}</th>
                                    <th>{t('col_actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(o => {
                                    const roleKey = o.role || o.officer_role || 'officer';
                                    const rBadge = ROLE_BADGE_MAP[roleKey] || ROLE_BADGE_MAP.officer;
                                    return (
                                    <tr key={o.id}>
                                        <td>
                                            <div>
                                                <div className="font-semibold text-sm"
                                                    style={{ color: 'var(--text-primary)' }}>{o.name}</div>
                                                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{o.email}</div>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="space-y-1">
                                                <span
                                                    className="inline-block text-[11px] font-bold px-2 py-0.5 rounded"
                                                    style={{ background: rBadge.bg, color: rBadge.color }}
                                                >
                                                    {tRole(roleKey)}
                                                </span>
                                                {o.team_name && (
                                                    <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                                        {o.team_name}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            <span className="font-mono text-xs px-2 py-1 rounded"
                                                style={{ background: 'var(--navy-light)', color: 'var(--navy)' }}>
                                                {o.employee_id}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-1.5 text-sm">
                                                <Building2 size={12} style={{ color: 'var(--text-muted)' }} />
                                                {o.department_name || '—'}
                                            </div>
                                        </td>
                                        <td className="text-sm muted">{o.designation || '—'}</td>
                                        <td>
                                            <div className="text-xs space-y-0.5 tabular-nums">
                                                <div style={{ color: 'var(--navy)' }}>
                                                    {o.current_active_count ?? 0} {t('active').toLowerCase()}
                                                </div>
                                                <div style={{ color: 'var(--india-green)' }}>
                                                    ✓ {o.total_resolved} {t('resolved').toLowerCase()}
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            {o.is_active ? (
                                                <span className="badge badge-resolved">
                                                    <span className="badge-dot" /> {t('active')}
                                                </span>
                                            ) : (
                                                <span className="badge badge-muted">
                                                    <span className="badge-dot" /> {t('inactive')}
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => setEditOfficer(o)}
                                                    className="btn-ghost p-1.5 rounded-lg"
                                                    title={t('edit_officer')}>
                                                    <Edit2 size={13} />
                                                </button>
                                                {o.is_active && (
                                                    <button
                                                        onClick={() => setDeleteOfficer(o)}
                                                        className="btn-ghost p-1.5 rounded-lg"
                                                        style={{ color: 'var(--status-critical)' }}
                                                        title={t('deactivate_officer')}>
                                                        <Trash2 size={13} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
