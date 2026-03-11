import { useEffect, useMemo, useState } from 'react';
import { classNames } from '~/utils/classNames';

type SessionRole = 'global_admin' | 'developer_admin' | 'user';

type ManagedUser = {
  id: string;
  username: string;
  email?: string;
  isAdmin: boolean;
  role: SessionRole;
  createdAt: string;
};

export default function UserManagementTab() {
  const [role, setRole] = useState<SessionRole>('user');
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<SessionRole>('user');
  const [editPassword, setEditPassword] = useState('');

  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<SessionRole>('user');

  useEffect(() => {
    let cancelled = false;

    const loadUsers = async (skipLoadingState = false) => {
      if (!skipLoadingState) {
        setLoading(true);
      }

      try {
        const response = await fetch('/api/auth/session?includeUsers=1');
        const data = (await response.json()) as {
          authenticated?: boolean;
          degraded?: boolean;
          user?: { role?: SessionRole; isAdmin?: boolean } | null;
          users?: ManagedUser[];
        };

        if (!cancelled) {
          if (!response.ok) {
            setRole(data.user?.role || 'user');
            setIsAdmin(Boolean(data.user?.isAdmin));
            setUsers([]);
            setError('Failed to load users.');
            return;
          }

          setRole(data.authenticated ? data.user?.role || 'user' : 'user');
          setIsAdmin(Boolean(data.authenticated && data.user?.isAdmin));
          setUsers(data.users || []);
          setError(data.degraded ? 'Authentication service is degraded right now.' : null);
        }
      } catch {
        if (!cancelled) {
          setRole('user');
          setIsAdmin(false);
          setUsers([]);
          setError('Failed to load users.');
        }
      } finally {
        if (!cancelled) {
          if (!skipLoadingState) {
            setLoading(false);
          }
        }
      }
    };

    void loadUsers();

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshUsers = async () => {
    try {
      const response = await fetch('/api/auth/session?includeUsers=1');
      const data = (await response.json()) as {
        authenticated?: boolean;
        user?: { role?: SessionRole; isAdmin?: boolean } | null;
        users?: ManagedUser[];
      };

      if (!response.ok) {
        setError('Failed to refresh users.');
        return;
      }

      setRole(data.authenticated ? data.user?.role || 'user' : 'user');
      setIsAdmin(Boolean(data.authenticated && data.user?.isAdmin));
      setUsers(data.users || []);
      setError(null);
    } catch {
      setError('Failed to refresh users.');
    }
  };

  const stats = useMemo(() => {
    const globalAdmins = users.filter((user) => user.role === 'global_admin').length;
    const developerAdmins = users.filter((user) => user.role === 'developer_admin').length;
    const standardUsers = users.filter((user) => user.role === 'user').length;

    return {
      total: users.length,
      globalAdmins,
      developerAdmins,
      standardUsers,
    };
  }, [users]);

  const hasAdminAccess = role !== 'user' || isAdmin;

  const canAssignGlobalAdmin = role === 'global_admin' || (role === 'user' && isAdmin);

  const createUser = async () => {
    if (!newUsername.trim() || !newPassword) {
      setError('Username and password are required.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (newRole === 'global_admin' && !canAssignGlobalAdmin) {
      setError('Only global admins can create global admins.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          username: newUsername.trim().toLowerCase(),
          email: newEmail.trim() || undefined,
          password: newPassword,
          role: newRole,
        }),
      });

      const data = (await response.json()) as { ok?: boolean; error?: string };

      if (!response.ok || !data.ok) {
        setError(data.error || 'Failed to create user.');
        return;
      }

      setNewUsername('');
      setNewEmail('');
      setNewPassword('');
      setNewRole('user');
      await refreshUsers();
    } catch {
      setError('Failed to create user.');
    } finally {
      setSubmitting(false);
    }
  };

  const beginEdit = (user: ManagedUser) => {
    setEditingUserId(user.id);
    setEditUsername(user.username);
    setEditEmail(user.email || '');
    setEditRole(user.role);
    setEditPassword('');
    setError(null);
  };

  const saveEdit = async (id: string) => {
    if (!editUsername.trim()) {
      setError('Username is required.');
      return;
    }

    if (editPassword && editPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (editRole === 'global_admin' && !canAssignGlobalAdmin) {
      setError('Only global admins can assign global admin role.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          id,
          username: editUsername.trim().toLowerCase(),
          email: editEmail.trim() || '',
          role: editRole,
          password: editPassword || undefined,
        }),
      });

      const data = (await response.json()) as { ok?: boolean; error?: string };

      if (!response.ok || !data.ok) {
        setError(data.error || 'Failed to update user.');
        return;
      }

      setEditingUserId(null);
      await refreshUsers();
    } catch {
      setError('Failed to update user.');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteUser = async (user: ManagedUser) => {
    const confirmed = window.confirm(`Delete user ${user.username}? This cannot be undone.`);

    if (!confirmed) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: user.id }),
      });

      const data = (await response.json()) as { ok?: boolean; error?: string };

      if (!response.ok || !data.ok) {
        setError(data.error || 'Failed to delete user.');
        return;
      }

      if (editingUserId === user.id) {
        setEditingUserId(null);
      }

      await refreshUsers();
    } catch {
      setError('Failed to delete user.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatRole = (value: SessionRole) => {
    switch (value) {
      case 'global_admin':
        return 'Global Admin';
      case 'developer_admin':
        return 'Developer Admin';
      default:
        return 'Basic User';
    }
  };

  const formatCreatedAt = (value: string) => {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return 'Unknown';
    }

    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  };

  if (loading) {
    return <div className="text-sm text-bolt-elements-textSecondary">Loading user management...</div>;
  }

  if (!hasAdminAccess) {
    return (
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
        <h3 className="text-sm font-medium text-bolt-elements-textPrimary">User Management</h3>
        <p className="mt-2 text-sm text-bolt-elements-textSecondary">
          User management is restricted to administrator accounts.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-bolt-elements-textPrimary">User Management</h3>
            <p className="mt-2 text-sm text-bolt-elements-textSecondary">
              Current accounts are loaded from the active persistence backend so you can verify who has access.
            </p>
          </div>
          <span
            className={classNames(
              'rounded-full px-3 py-1 text-xs font-medium',
              role === 'global_admin' || (role === 'user' && isAdmin)
                ? 'bg-amber-500/10 text-amber-600'
                : 'bg-blue-500/10 text-blue-600',
            )}
          >
            {role === 'global_admin' || (role === 'user' && isAdmin) ? 'Global Admin' : 'Developer Admin'}
          </span>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4 space-y-3">
          <h4 className="text-sm font-medium text-bolt-elements-textPrimary">Add User</h4>
          <input
            value={newUsername}
            onChange={(event) => setNewUsername(event.target.value)}
            placeholder="Username"
            className="w-full rounded-md border border-bolt-elements-borderColor bg-transparent px-3 py-2 text-sm"
          />
          <input
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
            placeholder="Email (optional)"
            className="w-full rounded-md border border-bolt-elements-borderColor bg-transparent px-3 py-2 text-sm"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="Password"
            className="w-full rounded-md border border-bolt-elements-borderColor bg-transparent px-3 py-2 text-sm"
          />
          <select
            value={newRole}
            onChange={(event) => setNewRole(event.target.value as SessionRole)}
            className="w-full rounded-md border border-bolt-elements-borderColor bg-transparent px-3 py-2 text-sm"
          >
            <option value="user">Basic User</option>
            <option value="developer_admin">Developer Admin</option>
            {canAssignGlobalAdmin && <option value="global_admin">Global Admin</option>}
          </select>
          <button
            onClick={() => void createUser()}
            disabled={submitting}
            className="rounded-md border border-bolt-elements-borderColor px-3 py-2 text-sm text-bolt-elements-textPrimary hover:text-bolt-elements-item-contentAccent disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Add user'}
          </button>
        </div>

        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
          <h4 className="text-sm font-medium text-bolt-elements-textPrimary">Account Summary</h4>
          <dl className="mt-3 space-y-3 text-sm text-bolt-elements-textSecondary">
            <div className="flex items-center justify-between gap-3">
              <dt>Total users</dt>
              <dd className="font-medium text-bolt-elements-textPrimary">{stats.total}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Global admins</dt>
              <dd className="font-medium text-bolt-elements-textPrimary">{stats.globalAdmins}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Developer admins</dt>
              <dd className="font-medium text-bolt-elements-textPrimary">{stats.developerAdmins}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Basic users</dt>
              <dd className="font-medium text-bolt-elements-textPrimary">{stats.standardUsers}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
          <h4 className="text-sm font-medium text-bolt-elements-textPrimary">Available Roles</h4>
          <div className="mt-3 space-y-2 text-sm text-bolt-elements-textSecondary">
            <p>Global Admin: full platform control.</p>
            <p>Developer Admin: delegated admin access.</p>
            <p>Basic User: personal and integration settings only.</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
        <div className="flex items-center justify-between gap-3 border-b border-bolt-elements-borderColor pb-3">
          <div>
            <h4 className="text-sm font-medium text-bolt-elements-textPrimary">Users</h4>
            <p className="mt-1 text-sm text-bolt-elements-textSecondary">Accounts are ordered by creation time.</p>
          </div>
          <span className="rounded-full bg-bolt-elements-item-backgroundAccent px-3 py-1 text-xs font-medium text-bolt-elements-textPrimary">
            {users.length} listed
          </span>
        </div>

        {users.length === 0 ? (
          <div className="py-8 text-sm text-bolt-elements-textSecondary">No users were found in the active persistence backend.</div>
        ) : (
          <div className="mt-4 space-y-3">
            {users.map((user) => (
              <div
                key={user.id}
                className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    {editingUserId === user.id ? (
                      <div className="space-y-2">
                        <input
                          value={editUsername}
                          onChange={(event) => setEditUsername(event.target.value)}
                          className="w-full rounded-md border border-bolt-elements-borderColor bg-transparent px-3 py-2 text-sm"
                          placeholder="Username"
                        />
                        <input
                          value={editEmail}
                          onChange={(event) => setEditEmail(event.target.value)}
                          className="w-full rounded-md border border-bolt-elements-borderColor bg-transparent px-3 py-2 text-sm"
                          placeholder="Email"
                        />
                        <select
                          value={editRole}
                          onChange={(event) => setEditRole(event.target.value as SessionRole)}
                          className="w-full rounded-md border border-bolt-elements-borderColor bg-transparent px-3 py-2 text-sm"
                        >
                          <option value="user">Basic User</option>
                          <option value="developer_admin">Developer Admin</option>
                          {canAssignGlobalAdmin && <option value="global_admin">Global Admin</option>}
                        </select>
                        <input
                          type="password"
                          value={editPassword}
                          onChange={(event) => setEditPassword(event.target.value)}
                          className="w-full rounded-md border border-bolt-elements-borderColor bg-transparent px-3 py-2 text-sm"
                          placeholder="New password (optional)"
                        />
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <h5 className="truncate text-sm font-semibold text-bolt-elements-textPrimary">{user.username}</h5>
                          <span
                            className={classNames(
                              'rounded-full px-2.5 py-1 text-[11px] font-medium',
                              user.role === 'global_admin'
                                ? 'bg-amber-500/10 text-amber-600'
                                : user.role === 'developer_admin'
                                  ? 'bg-blue-500/10 text-blue-600'
                                  : 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300',
                            )}
                          >
                            {formatRole(user.role)}
                          </span>
                        </div>
                        <p className="mt-1 break-all text-sm text-bolt-elements-textSecondary">
                          {user.email || 'No email configured'}
                        </p>
                      </>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm text-bolt-elements-textSecondary md:text-right">
                    <div>
                      <div className="text-xs uppercase tracking-wide opacity-70">Created</div>
                      <div className="text-bolt-elements-textPrimary">{formatCreatedAt(user.createdAt)}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide opacity-70">Actions</div>
                      <div className="flex items-center gap-2 md:justify-end">
                        {editingUserId === user.id ? (
                          <>
                            <button
                              onClick={() => void saveEdit(user.id)}
                              disabled={submitting}
                              className="rounded border border-bolt-elements-borderColor px-2 py-1 text-xs hover:text-bolt-elements-item-contentAccent disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingUserId(null)}
                              className="rounded border border-bolt-elements-borderColor px-2 py-1 text-xs"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => beginEdit(user)}
                              className="rounded border border-bolt-elements-borderColor px-2 py-1 text-xs"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => void deleteUser(user)}
                              disabled={submitting}
                              className="rounded border border-rose-500/40 px-2 py-1 text-xs text-rose-600 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}