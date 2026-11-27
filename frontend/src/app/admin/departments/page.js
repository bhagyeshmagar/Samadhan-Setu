'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/lib/i18n';
import { adminAPI } from '@/lib/api';
import {
    Building2, Plus, Edit2, Trash2, X, Check, AlertTriangle,
    Loader2, ChevronRight, RefreshCw, Phone, Mail, Code2,
    Users, ShieldOff,
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

const inputStyle = {
    width: '100%', padding: '8px 12px', borderRadius: '8px',
    border: '1px solid var(--border-mid)',
    background: 'var(--bg-section)', color: 'var(--text-primary)',
    fontSize: '13px', outline: 'none',
};

/* ── Create Department Modal ── */
function CreateDeptModal({ onClose, onCreated }) {
    const [form, setForm] = useState({
        name: '', code: '', description: '',
        contact_email: '', contact_phone: '',
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!form.name || !form.code) {
            setError('Name and Code are required.');
            return;
        }
        setLoading(true);
        try {
            const dept = await adminAPI.createDepartment(form);
            onCreated(dept);
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal title="Create New Department" onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="gov-alert error text-sm flex gap-2">
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {error}
                    </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Department Name" required>
                        <input style={inputStyle} placeholder="Public Works Department"
                            value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                    </Field>
                    <Field label="Code" required>
                        <input style={inputStyle} placeholder="PWD" maxLength={10}
                            value={form.code}
                            onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
                    </Field>
                </div>
                <Field label="Description">
                    <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '72px' }}
                        placeholder="Brief description of this department's responsibilities…"
                        value={form.description}
                        onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Contact Email">
                        <input style={inputStyle} type="email" placeholder="dept@gov.in"
                            value={form.contact_email}
                            onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} />
                    </Field>
                    <Field label="Contact Phone">
                        <input style={inputStyle} placeholder="+91 11 2345 6789"
                            value={form.contact_phone}
                            onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} />
                    </Field>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={onClose} className="btn-ghost text-sm px-4 py-2">Cancel</button>
                    <button type="submit" disabled={loading}
                        className="flex items-center gap-2 text-sm px-5 py-2 rounded-lg font-semibold"
                        style={{ background: 'var(--navy)', color: 'var(--primary-ink)', opacity: loading ? 0.7 : 1 }}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                        {loading ? 'Creating…' : 'Create Department'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

/* ── Edit Department Modal ── */
function EditDeptModal({ dept, onClose, onUpdated }) {
    const [form, setForm] = useState({
        name: dept.name || '',
        description: dept.description || '',
        contact_email: dept.contact_email || '',
        contact_phone: dept.contact_phone || '',
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const updated = await adminAPI.updateDepartment(dept.id, form);
            onUpdated(updated);
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal title={`Edit — ${dept.name}`} onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="gov-alert error text-sm flex gap-2">
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {error}
                    </div>
                )}
                <Field label="Department Name" required>
                    <input style={inputStyle} value={form.name}
                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </Field>
                <Field label="Description">
                    <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '72px' }}
                        value={form.description}
                        onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Contact Email">
                        <input style={inputStyle} type="email" value={form.contact_email}
                            onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} />
                    </Field>
                    <Field label="Contact Phone">
                        <input style={inputStyle} value={form.contact_phone}
                            onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} />
                    </Field>
                </div>
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

/* ── Confirm Delete Modal ── */
function ConfirmDeleteModal({ dept, onClose, onConfirm }) {
    const [loading, setLoading] = useState(false);

    const handle = async () => {
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
                            Deactivate &quot;{dept.name}&quot;?
                        </p>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                            Departments with active officers cannot be deactivated. 
                            This action will remove it from the active list.
                        </p>
                    </div>
                </div>
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="btn-ghost text-sm px-4 py-2">Cancel</button>
                    <button onClick={handle} disabled={loading}
                        className="flex items-center gap-2 text-sm px-5 py-2 rounded-lg font-semibold"
                        style={{ background: 'var(--status-critical)', color: 'white', opacity: loading ? 0.7 : 1 }}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <ShieldOff size={14} />}
                        {loading ? 'Deactivating…' : 'Yes, Deactivate'}
                    </button>
                </div>
            </div>
        </Modal>
    );
}

/* ── Create / Edit Field Team Modal ── */
function TeamModal({ team, departments, teamLeads, onClose, onSaved }) {
    const isEdit = Boolean(team);
    const [form, setForm] = useState({
        name: team?.name || '',
        code: team?.code || '',
        department_id: team?.department_id || departments[0]?.id || '',
        team_lead_officer_id: team?.team_lead_officer_id || '',
        ward_coverage: Array.isArray(team?.ward_coverage) ? team.ward_coverage.join(', ') : '',
        specialization: team?.specialization || '',
        member_count: team?.member_count || 6,
        daily_capacity: team?.daily_capacity || 10,
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const eligibleLeads = teamLeads.filter(
        o => o.is_active !== false && (!form.department_id || o.department_id === form.department_id)
    );

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!form.name || !form.department_id) {
            setError('Team Name and Department are required.');
            return;
        }
        setLoading(true);
        try {
            const payload = {
                ...form,
                member_count: Number(form.member_count) || 6,
                daily_capacity: Number(form.daily_capacity) || 10,
                ward_coverage: form.ward_coverage
                    .split(',')
                    .map(w => w.trim())
                    .filter(Boolean),
            };
            const saved = isEdit
                ? await adminAPI.updateTeam(team.id, payload)
                : await adminAPI.createTeam(payload);
            onSaved(saved);
            onClose();
        } catch (err) {
            setError(err.message || 'Failed to save field team.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal title={isEdit ? `Edit Field Team — ${team.name}` : 'Create Departmental Field Team'} onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="gov-alert error text-sm flex gap-2">
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {error}
                    </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Team Name" required>
                        <input style={inputStyle} placeholder="Dadar Quick Response Squad"
                            value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                    </Field>
                    <Field label="Team Code">
                        <input style={inputStyle} placeholder="ROADS-T3"
                            value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
                    </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Department" required>
                        <select style={inputStyle} value={form.department_id}
                            onChange={e => setForm(f => ({ ...f, department_id: e.target.value, team_lead_officer_id: '' }))}>
                            <option value="">Select department…</option>
                            {departments.map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Assigned Team Lead">
                        <select style={inputStyle} value={form.team_lead_officer_id}
                            onChange={e => setForm(f => ({ ...f, team_lead_officer_id: e.target.value }))}>
                            <option value="">Unassigned</option>
                            {eligibleLeads.map(o => (
                                <option key={o.id} value={o.id}>{o.name} ({o.employee_id})</option>
                            ))}
                        </select>
                    </Field>
                </div>
                <Field label="Specialization">
                    <input style={inputStyle} placeholder="Hot-Mix Asphalt & Pothole Patching"
                        value={form.specialization} onChange={e => setForm(f => ({ ...f, specialization: e.target.value }))} />
                </Field>
                <Field label="Ward Coverage (comma-separated)">
                    <input style={inputStyle} placeholder="Ward 12 - Dadar, Ward 14 - Mahim"
                        value={form.ward_coverage} onChange={e => setForm(f => ({ ...f, ward_coverage: e.target.value }))} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Crew Members">
                        <input style={inputStyle} type="number" min={1} max={50}
                            value={form.member_count} onChange={e => setForm(f => ({ ...f, member_count: e.target.value }))} />
                    </Field>
                    <Field label="Daily Capacity (Tasks)">
                        <input style={inputStyle} type="number" min={1} max={100}
                            value={form.daily_capacity} onChange={e => setForm(f => ({ ...f, daily_capacity: e.target.value }))} />
                    </Field>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={onClose} className="btn-ghost text-sm px-4 py-2">Cancel</button>
                    <button type="submit" disabled={loading}
                        className="flex items-center gap-2 text-sm px-5 py-2 rounded-lg font-semibold"
                        style={{ background: 'var(--navy)', color: 'var(--primary-ink)', opacity: loading ? 0.7 : 1 }}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        {loading ? 'Saving…' : isEdit ? 'Save Team' : 'Create Field Team'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

/* ── Department Card ── */
function DeptCard({ dept, onEdit, onDelete, onReactivate, t, locale }) {
    return (
        <div className="gov-card p-5 flex flex-col gap-4 transition-shadow hover:shadow-lg"
            style={{ borderTop: `3px solid var(--navy)` }}>
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: 'var(--navy-light)' }}>
                        <Building2 size={18} style={{ color: 'var(--navy)' }} />
                    </div>
                    <div>
                        <h3 className="font-bold text-sm leading-tight" style={{ color: 'var(--text-primary)' }}>
                            {dept.name}
                        </h3>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded mt-1"
                            style={{ background: 'var(--navy-light)', color: 'var(--navy)' }}>
                            <Code2 size={9} /> {dept.code}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => onEdit(dept)}
                        className="btn-ghost p-1.5 rounded-lg" title="Edit">
                        <Edit2 size={13} />
                    </button>
                    {dept.is_active !== false ? (
                        <button onClick={() => onDelete(dept)}
                            className="btn-ghost p-1.5 rounded-lg"
                            style={{ color: 'var(--status-critical)' }}
                            title="Deactivate">
                            <Trash2 size={13} />
                        </button>
                    ) : (
                        <button onClick={() => onReactivate && onReactivate(dept)}
                            className="btn-ghost p-1.5 rounded-lg"
                            style={{ color: 'var(--india-green)' }}
                            title="Reactivate">
                            <RefreshCw size={13} />
                        </button>
                    )}
                </div>
            </div>

            {/* Description */}
            {dept.description && (
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {dept.description}
                </p>
            )}

            {/* Contact info */}
            <div className="space-y-1.5">
                {dept.contact_email && (
                    <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                        <Mail size={11} /> {dept.contact_email}
                    </div>
                )}
                {dept.contact_phone && (
                    <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                        <Phone size={11} /> {dept.contact_phone}
                    </div>
                )}
                {!dept.contact_email && !dept.contact_phone && (
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('no_contact_info')}</p>
                )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-2"
                style={{ borderTop: '1px solid var(--border)' }}>
                {dept.is_active !== false ? (
                    <span className="badge badge-resolved">
                        <span className="badge-dot" /> {t('active')}
                    </span>
                ) : (
                    <span className="badge badge-critical">
                        <span className="badge-dot" /> {t('inactive')}
                    </span>
                )}
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {new Date(dept.created_at).toLocaleDateString(locale)}
                </span>
            </div>
        </div>
    );
}

/* ── Main page ── */
export default function DepartmentsManagementPage() {
    const { user, loading: authLoading } = useAuth();
    const { t, locale } = useLanguage();
    const router = useRouter();

    const [departments, setDepartments] = useState([]);
    const [teams, setTeams] = useState([]);
    const [teamLeads, setTeamLeads] = useState([]);
    const [activeTab, setActiveTab] = useState('departments'); // departments | teams
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [editDept, setEditDept] = useState(null);
    const [deleteDept, setDeleteDept] = useState(null);
    const [teamModalState, setTeamModalState] = useState(null); // null | { team: null | obj }

    useEffect(() => {
        if (!authLoading && (!user || (user.role !== 'admin' && user.role !== 'super_admin'))) router.push('/login');
    }, [user, authLoading, router]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [deptsData, teamsData, leadsData] = await Promise.all([
                adminAPI.getDepartments(),
                adminAPI.getTeams(),
                adminAPI.getOfficers(undefined, 'team_lead'),
            ]);
            setDepartments(Array.isArray(deptsData) ? deptsData : []);
            setTeams(Array.isArray(teamsData) ? teamsData : []);
            setTeamLeads(Array.isArray(leadsData) ? leadsData : []);
        } catch (err) {
            setError(err.message || 'Failed to load departments & field teams');
        } finally {
            setLoading(false);
        }
    }, []);

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

    const handleReactivate = async (dept) => {
        try {
            await adminAPI.updateDepartment(dept.id, { is_active: true });
            setDepartments(prev => prev.map(d => d.id === dept.id ? { ...d, is_active: true } : d));
        } catch (err) {
            setError(err.message);
        }
    };

    const handleDelete = async () => {
        try {
            await adminAPI.deleteDepartment(deleteDept.id);
            setDepartments(prev => prev.filter(d => d.id !== deleteDept.id));
            setDeleteDept(null);
        } catch (err) {
            setError(err.message);
            setDeleteDept(null);
        }
    };

    const handleDeactivateTeam = async (teamId) => {
        try {
            await adminAPI.deleteTeam(teamId);
            await fetchData();
        } catch (err) {
            setError(err.message);
        }
    };

    if (authLoading || (loading && departments.length === 0)) {
        return (
            <div className="flex justify-center items-center h-[60vh]">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="animate-spin" size={32} style={{ color: 'var(--navy)' }} />
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('loading_depts_teams')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto py-6">
            {/* Modals */}
            {showCreate && (
                <CreateDeptModal
                    onClose={() => setShowCreate(false)}
                    onCreated={d => setDepartments(prev => [d, ...prev])}
                />
            )}
            {editDept && (
                <EditDeptModal
                    dept={editDept}
                    onClose={() => setEditDept(null)}
                    onUpdated={updated => {
                        setDepartments(prev => prev.map(d => d.id === updated.id ? updated : d));
                        setEditDept(null);
                    }}
                />
            )}
            {deleteDept && (
                <ConfirmDeleteModal
                    dept={deleteDept}
                    onClose={() => setDeleteDept(null)}
                    onConfirm={handleDelete}
                />
            )}
            {teamModalState && (
                <TeamModal
                    team={teamModalState.team}
                    departments={departments}
                    teamLeads={teamLeads}
                    onClose={() => setTeamModalState(null)}
                    onSaved={() => fetchData()}
                />
            )}

            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <div className="breadcrumb mb-2">
                        <span>{t('admin_oversight')}</span>
                        <ChevronRight size={10} className="breadcrumb-sep" />
                        <span className="breadcrumb-current">{t('depts_and_teams')}</span>
                    </div>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--navy)' }}>
                        {t('departments_mgmt_title')}
                    </h1>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {t('departments_mgmt_sub')}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={fetchData} className="btn-ghost flex items-center gap-1.5 text-xs">
                        <RefreshCw size={13} /> {t('refresh')}
                    </button>
                    {activeTab === 'departments' ? (
                        <button
                            onClick={() => setShowCreate(true)}
                            className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl font-semibold"
                            style={{ background: 'var(--navy)', color: 'var(--primary-ink)' }}>
                            <Plus size={15} /> {t('new_department')}
                        </button>
                    ) : (
                        <button
                            onClick={() => setTeamModalState({ team: null })}
                            className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl font-semibold"
                            style={{ background: 'var(--navy)', color: 'var(--primary-ink)' }}>
                            <Plus size={15} /> {t('new_field_team')}
                        </button>
                    )}
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="gov-alert error mb-4 flex gap-2">
                    <AlertTriangle size={15} className="shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Tabs */}
            <div className="flex items-center gap-1 p-1 rounded-lg border mb-6 w-fit"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <button
                    type="button"
                    onClick={() => setActiveTab('departments')}
                    className="px-4 py-1.5 rounded-md text-xs font-semibold transition-colors"
                    style={
                        activeTab === 'departments'
                            ? { background: 'var(--navy)', color: 'var(--primary-ink)' }
                            : { color: 'var(--text-secondary)' }
                    }
                >
                    {t('departments')} ({departments.length})
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('teams')}
                    className="px-4 py-1.5 rounded-md text-xs font-semibold transition-colors"
                    style={
                        activeTab === 'teams'
                            ? { background: 'var(--navy)', color: 'var(--primary-ink)' }
                            : { color: 'var(--text-secondary)' }
                    }
                >
                    {t('field_redressal_teams')} ({teams.length})
                </button>
            </div>

            {activeTab === 'departments' ? (
                <>
                    {/* Summary bar */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
                        {[
                            { label: t('total_departments'), val: departments.length, color: 'var(--navy)', icon: <Building2 size={18}/> },
                            { label: t('active_field_teams'), val: teams.filter(tm => tm.is_active !== false).length, color: 'var(--india-green)', icon: <Users size={18}/> },
                            { label: t('with_contact'), val: departments.filter(d => d.contact_email || d.contact_phone).length, color: 'var(--saffron-dark)', icon: <Mail size={18}/> },
                        ].map(s => (
                            <div key={s.label} className="gov-card p-4 flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                                    style={{ background: 'var(--bg-section)', color: s.color }}>
                                    {s.icon}
                                </div>
                                <div>
                                    <div className="text-2xl font-bold tabular-nums" style={{ color: s.color }}>{s.val}</div>
                                    <div className="text-[11px] font-medium uppercase tracking-wide"
                                        style={{ color: 'var(--text-muted)' }}>{s.label}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Grid of department cards */}
                    {departments.length === 0 ? (
                        <div className="flex flex-col items-center py-20 gap-4">
                            <Building2 size={48} style={{ color: 'var(--border-mid)' }} />
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('no_departments_yet')}</p>
                            <button onClick={() => setShowCreate(true)}
                                className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl font-semibold"
                                style={{ background: 'var(--navy)', color: 'var(--primary-ink)' }}>
                                <Plus size={14} /> {t('create_first_department')}
                            </button>
                        </div>
                    ) : (
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                            {departments.map(dept => (
                                <DeptCard
                                    key={dept.id}
                                    dept={dept}
                                    onEdit={setEditDept}
                                    onDelete={setDeleteDept}
                                    onReactivate={handleReactivate}
                                    t={t}
                                    locale={locale}
                                />
                            ))}
                        </div>
                    )}
                </>
            ) : (
                /* Field Teams Management Grid */
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {teams.map(team => (
                        <div key={team.id} className="gov-card p-5 flex flex-col gap-3">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded"
                                        style={{ background: 'var(--navy-light)', color: 'var(--navy)' }}>
                                        {team.code}
                                    </span>
                                    <h3 className="font-bold text-sm mt-1.5" style={{ color: 'var(--text-primary)' }}>
                                        {team.name}
                                    </h3>
                                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                        {team.department_name}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button onClick={() => setTeamModalState({ team })} className="btn-ghost p-1.5 rounded-lg" title="Edit team">
                                        <Edit2 size={13} />
                                    </button>
                                    {team.is_active !== false && (
                                        <button onClick={() => handleDeactivateTeam(team.id)} className="btn-ghost p-1.5 rounded-lg"
                                            style={{ color: 'var(--status-critical)' }} title="Deactivate team">
                                            <Trash2 size={13} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
                                <div>{t('team_lead_label')}: <strong style={{ color: 'var(--text-primary)' }}>{team.team_lead_name || t('unassigned')}</strong></div>
                                <div>{t('specialization_label')}: {team.specialization || t('general_maintenance')}</div>
                                <div>{t('wards_label')}: {(team.ward_coverage || []).join(', ') || t('all_dept_wards')}</div>
                            </div>

                            <div className="flex items-center justify-between pt-2.5 mt-auto text-xs border-t"
                                style={{ borderColor: 'var(--border)' }}>
                                <span className="font-mono tabular-nums" style={{ color: 'var(--text-primary)' }}>
                                    {t('load_label')}: <strong>{team.active_work_orders ?? 0}</strong>/{team.daily_capacity} · {team.member_count} {t('staff_label')}
                                </span>
                                {team.is_active !== false ? (
                                    <span className="badge badge-resolved"><span className="badge-dot" /> {t('active')}</span>
                                ) : (
                                    <span className="badge badge-critical"><span className="badge-dot" /> {t('inactive')}</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
