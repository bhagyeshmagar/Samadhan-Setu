'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { adminAPI } from '@/lib/api';
import {
    Users, Plus, Edit2, Trash2, X, Check, AlertTriangle,
    Loader2, ChevronRight, Search, Building2, Shield,
    UserCheck, UserX, RefreshCw, BadgeCheck,
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
    nodal_officer: { label: 'Nodal Officer', bg: '#FFF7ED', color: '#C2410C' },
    inspection_officer: { label: 'Inspector', bg: '#E0F2FE', color: '#0369A1' },
    team_lead: { label: 'Team Lead', bg: '#ECFDF5', color: '#047857' },
    supervisor: { label: 'Supervisor', bg: '#FEF3C7', color: '#B45309' },
    officer: { label: 'Officer', bg: '#EEF3FB', color: '#003580' },
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
                        style={{ background: 'var(--navy)', color: 'white', opacity: loading ? 0.7 : 1 }}>
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
                        style={{ background: 'var(--navy)', color: 'white', opacity: loading ? 0.7 : 1 }}>
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
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading officers…</p>
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
                        <span>Admin</span>
                        <ChevronRight size={10} className="breadcrumb-sep" />
                        <span className="breadcrumb-current">Officers</span>
                    </div>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--navy)' }}>
                        Officer Management
                    </h1>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        Manage field officers across all departments — अधिकारी प्रबंधन
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={fetchData} className="btn-ghost flex items-center gap-1.5 text-xs">
                        <RefreshCw size={13} /> Refresh
                    </button>
                    <button
                        onClick={() => setShowCreate(true)}
                        className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl font-semibold"
                        style={{ background: 'var(--navy)', color: 'white' }}>
                        <Plus size={15} /> Add Officer
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
                            placeholder="Search by name, email, employee ID…"
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
                        <option value="">All Roles</option>
                        <option value="nodal_officer">Nodal Officers</option>
                        <option value="inspection_officer">Inspection Officers</option>
                        <option value="team_lead">Field Team Leads</option>
                        <option value="supervisor">Supervisors</option>
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
                        <option value="">All Departments</option>
                        {departments.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4 mb-5">
                {[
                    { label: 'Total Officers', val: officers.length, color: 'var(--navy)', icon: <Users size={18}/> },
                    { label: 'Active', val: officers.filter(o => o.is_active).length, color: 'var(--india-green)', icon: <UserCheck size={18}/> },
                    { label: 'Inactive', val: officers.filter(o => !o.is_active).length, color: 'var(--text-muted)', icon: <UserX size={18}/> },
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
                        <Shield size={12} /> Officers ({filtered.length})
                    </span>
                </div>
                {filtered.length === 0 ? (
                    <div className="flex flex-col items-center py-16 gap-3">
                        <Users size={36} style={{ color: 'var(--border-mid)' }} />
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                            {search ? 'No officers match your search' : 'No officers found'}
                        </p>
                        <button onClick={() => setShowCreate(true)}
                            className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl font-semibold mt-2"
                            style={{ background: 'var(--navy)', color: 'white' }}>
                            <Plus size={14} /> Add First Officer
                        </button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="gov-table">
                            <thead>
                                <tr>
                                    <th>Officer</th>
                                    <th>Role & Team</th>
                                    <th>Employee ID</th>
                                    <th>Department</th>
                                    <th>Designation</th>
                                    <th>Workload</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(o => {
                                    const rBadge = ROLE_BADGE_MAP[o.role || o.officer_role] || ROLE_BADGE_MAP.officer;
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
                                                    {rBadge.label}
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
                                                    {o.current_active_count ?? 0} active
                                                </div>
                                                <div style={{ color: 'var(--india-green)' }}>
                                                    ✓ {o.total_resolved} resolved
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            {o.is_active ? (
                                                <span className="badge badge-resolved">
                                                    <span className="badge-dot" /> Active
                                                </span>
                                            ) : (
                                                <span className="badge badge-muted">
                                                    <span className="badge-dot" /> Inactive
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => setEditOfficer(o)}
                                                    className="btn-ghost p-1.5 rounded-lg"
                                                    title="Edit officer">
                                                    <Edit2 size={13} />
                                                </button>
                                                {o.is_active && (
                                                    <button
                                                        onClick={() => setDeleteOfficer(o)}
                                                        className="btn-ghost p-1.5 rounded-lg"
                                                        style={{ color: 'var(--status-critical)' }}
                                                        title="Deactivate officer">
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
