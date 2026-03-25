
import React, { useEffect, useState } from 'react';
import { UserProfile, Language } from '../types';
import { apiFetch } from '../services/apiFetch';

interface AdminPanelProps {
  users: Record<string, { profile: UserProfile; logs?: any[]; health?: any[] }>;
  onUpdateUser: (email: string, updates: Partial<UserProfile>) => void;
  onRenameUser: (oldEmail: string, newEmail: string) => void;
  onDeleteUser: (email: string) => void;
  language: Language;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ users: localUsers, onUpdateUser, onRenameUser, onDeleteUser, language }) => {
  const [serverUsers, setServerUsers] = useState<Record<string, any> | null>(null);

  // Fetch all users from server admin endpoint
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await apiFetch('/api/admin/users');
        if (res.ok) {
          const data = await res.json();
          setServerUsers(data);
        }
      } catch (e) {
        console.error("Failed to fetch admin users", e);
      }
    };
    fetchUsers();
  }, [localUsers]); // Re-fetch when local changes trigger re-render

  // Use server users if available, fall back to local
  const users = serverUsers || localUsers;

  const t = language === 'de' ? {
    title: 'Benutzerverwaltung',
    email: 'Benutzer / E-Mail',
    status: 'Status',
    role: 'Rolle',
    dataType: 'Datentyp',
    actions: 'Aktionen',
    approved: 'Freigeschaltet',
    pending: 'Wartend',
    admin: 'Admin',
    user: 'Nutzer',
    approve: 'Freischalten',
    block: 'Sperren',
    makeAdmin: 'Admin machen',
    removeAdmin: 'Admin entfernen',
    delete: 'Löschen',
    confirmDelete: 'Benutzer wirklich löschen?',
    changePassword: 'Passwort ändern',
    newPassword: 'Neues Passwort',
    save: 'Speichern',
    passwordChanged: 'Passwort erfolgreich geändert',
    adminSecurity: 'Admin Sicherheit',
    rename: 'Umbenennen',
    mockData: 'Mockup Daten',
    realData: 'Echtdaten',
  } : {
    title: 'User Management',
    email: 'User / Email',
    status: 'Status',
    role: 'Role',
    dataType: 'Data Type',
    actions: 'Actions',
    approved: 'Approved',
    pending: 'Pending',
    admin: 'Admin',
    user: 'User',
    approve: 'Approve',
    block: 'Block',
    makeAdmin: 'Make Admin',
    removeAdmin: 'Remove Admin',
    delete: 'Delete',
    confirmDelete: 'Are you sure you want to delete this user?',
    changePassword: 'Change Password',
    newPassword: 'New Password',
    save: 'Save',
    passwordChanged: 'Password changed successfully',
    adminSecurity: 'Admin Security',
    rename: 'Rename',
    mockData: 'Mockup Data',
    realData: 'Real Data',
  };

  const [newPasswords, setNewPasswords] = React.useState<Record<string, string>>({});
  const [editingEmail, setEditingEmail] = React.useState<string | null>(null);
  const [tempEmail, setTempEmail] = React.useState("");

  return (
    <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 overflow-hidden animate-fade-in mb-8">
      <div className="bg-slate-900 p-8 text-white">
        <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
          <i className="fas fa-users-cog text-orange-500"></i>
          {t.title}
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.email}</th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.status}</th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.role}</th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.dataType}</th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">{t.actions}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {Object.entries(users || {}).map(([email, userData]) => {
              const data = userData as { profile: UserProfile; logs?: any[]; health?: any[] };
              if (!data || !data.profile) return null;
              return (
              <tr key={email} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4">
                  {editingEmail === email ? (
                    <div className="flex items-center gap-2">
                      <input
                        value={tempEmail}
                        onChange={(e) => setTempEmail(e.target.value)}
                        className="px-2 py-1 bg-white border border-slate-200 rounded text-sm font-bold outline-none"
                      />
                      <button onClick={() => { onRenameUser(email, tempEmail); setEditingEmail(null); }} className="text-green-500 hover:text-green-600"><i className="fas fa-check"></i></button>
                      <button onClick={() => setEditingEmail(null)} className="text-red-400 hover:text-red-500"><i className="fas fa-times"></i></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 group">
                      <span className="font-bold text-slate-900 text-sm whitespace-nowrap">{email}</span>
                      <button
                        onClick={() => { setEditingEmail(email); setTempEmail(email); }}
                        className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-indigo-600 transition-all p-1"
                      >
                        <i className="fas fa-pen text-[10px]"></i>
                      </button>
                    </div>
                  )}
                </td>
                <td className="px-6 py-4">
                  <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${data.profile.isApproved !== false ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}>
                    {data.profile.isApproved !== false ? t.approved : t.pending}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${data.profile.isAdmin ? 'bg-purple-100 text-purple-600' : 'bg-slate-100 text-slate-600'}`}>
                    {data.profile.isAdmin ? t.admin : t.user}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden w-fit bg-slate-50">
                    <button
                      onClick={() => onUpdateUser(email, { mockMode: false })}
                      className={`px-3 py-1.5 text-[8px] font-black uppercase tracking-widest transition-all ${!data.profile.mockMode ? 'bg-indigo-600 text-white shadow-inner' : 'text-slate-400 hover:bg-white'}`}
                    >
                      {t.realData}
                    </button>
                    <button
                      onClick={() => onUpdateUser(email, { mockMode: true })}
                      className={`px-3 py-1.5 text-[8px] font-black uppercase tracking-widest transition-all ${data.profile.mockMode ? 'bg-indigo-600 text-white shadow-inner' : 'text-slate-400 hover:bg-white'}`}
                    >
                      {t.mockData}
                    </button>
                  </div>
                </td>
                <td className="px-6 py-4 text-right space-x-2">
                  {data.profile.isApproved === false ? (
                    <button
                      onClick={() => onUpdateUser(email, { isApproved: true })}
                      className="px-4 py-2 bg-green-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-green-700 transition-all shadow-lg"
                    >
                      {t.approve}
                    </button>
                  ) : (
                    <button
                      onClick={() => onUpdateUser(email, { isApproved: false })}
                      className="px-4 py-2 border border-slate-200 text-slate-400 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-red-50 hover:text-red-500 hover:border-red-100 transition-all"
                    >
                      {t.block}
                    </button>
                  )}

                  {data.profile.isAdmin ? (
                    <button
                      onClick={() => onUpdateUser(email, { isAdmin: false })}
                      className="px-4 py-2 border border-slate-200 text-slate-400 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-100 hover:text-slate-900 transition-all"
                    >
                      {t.removeAdmin}
                    </button>
                  ) : (
                    <button
                      onClick={() => onUpdateUser(email, { isAdmin: true })}
                      className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
                    >
                      {t.makeAdmin}
                    </button>
                  )}

                  <button
                    onClick={async () => {
                      const pass = prompt(t.newPassword);
                      if (pass) {
                        try {
                          const res = await apiFetch('/api/admin/password', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email, password: pass }),
                          });
                          if (res.ok) {
                            alert(t.passwordChanged);
                          } else {
                            const data = await res.json();
                            alert(data.error || 'Failed');
                          }
                        } catch { alert('Connection error'); }
                      }
                    }}
                    className="px-4 py-2 border border-slate-200 text-slate-400 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-100 hover:text-slate-900 transition-all"
                    title={t.changePassword}
                  >
                    <i className="fas fa-key"></i>
                  </button>

                  <button
                    onClick={() => {
                      if (window.confirm(t.confirmDelete)) {
                        onDeleteUser(email);
                      }
                    }}
                    className="px-4 py-2 border border-red-200 text-red-500 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all shadow-sm"
                    title={t.delete}
                  >
                    <i className="fas fa-trash-can"></i>
                  </button>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>

      <div className="bg-slate-50 p-8 border-t border-slate-100">
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
          <i className="fas fa-shield-halved"></i>
          {t.adminSecurity}
        </h3>

        <div className="max-w-md bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
            {t.newPassword}
          </label>
          <div className="flex gap-3">
            <input
              type="password"
              value={newPasswords['admin'] || ''}
              onChange={(e) => setNewPasswords(prev => ({ ...prev, admin: e.target.value }))}
              placeholder="••••••••"
              className="flex-grow px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none font-bold text-slate-900 text-sm transition-all"
            />
            <button
              onClick={async () => {
                const pass = newPasswords['admin'];
                if (pass) {
                  try {
                    const res = await apiFetch('/api/admin/password', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ email: 'admin@heliofit.ai', password: pass }),
                    });
                    if (res.ok) {
                      setNewPasswords(prev => ({ ...prev, admin: '' }));
                      alert(t.passwordChanged);
                    } else {
                      const data = await res.json();
                      alert(data.error || 'Failed');
                    }
                  } catch { alert('Connection error'); }
                }
              }}
              className="px-6 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg"
            >
              {t.save}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
