import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usersApi } from '../services/api';
import { AppHeader } from '../components/AppHeader';

interface UserRecord {
  id: string;
  username: string;
  email: string;
  role: string;
}

const VALID_ROLES = ['user', 'technical', 'product_manager', 'admin'];

export function AdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  // Create User form state
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newConfirmPassword, setNewConfirmPassword] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [creating, setCreating] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    if (user?.role !== 'admin') {
      navigate('/dashboard');
      return;
    }
    loadUsers();
  }, [user, navigate]);

  const loadUsers = async () => {
    try {
      const data = await usersApi.listAll();
      setUsers(data.users);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    setError('');
    setSuccess('');
    setUpdatingUserId(userId);

    try {
      await usersApi.updateRole(userId, newRole);
      setUsers(users.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
      setSuccess(`Role updated successfully`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setPasswordError('');

    if (newPassword !== newConfirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    setCreating(true);

    try {
      const data = await usersApi.create(newUsername, newEmail, newPassword, newRole);
      setSuccess(`User "${newUsername}" created successfully`);
      setUsers([...users, data.user]);
      setNewUsername('');
      setNewEmail('');
      setNewPassword('');
      setNewConfirmPassword('');
      setNewRole('user');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  if (user?.role !== 'admin') {
    return null;
  }

  return (
    <div className="dashboard-container">
      <AppHeader />

      <main className="dashboard-main">
        <h2>Admin Panel — User Management</h2>
        <p className="settings-subtitle">View and manage user roles across the platform.</p>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <div className="admin-create-user-section">
          <h3>Create User</h3>
          <form onSubmit={handleCreateUser} className="admin-create-user-form">
            <div className="form-group">
              <label htmlFor="new-username">Username</label>
              <input
                id="new-username"
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                required
                placeholder="Enter username"
                disabled={creating}
              />
            </div>
            <div className="form-group">
              <label htmlFor="new-email">Email</label>
              <input
                id="new-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
                placeholder="Enter email"
                disabled={creating}
              />
            </div>
            <div className="form-group">
              <label htmlFor="new-password">Password</label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                placeholder="Enter password"
                minLength={8}
                disabled={creating}
              />
            </div>
            <div className="form-group">
              <label htmlFor="new-confirm-password">Confirm Password</label>
              <input
                id="new-confirm-password"
                type="password"
                value={newConfirmPassword}
                onChange={(e) => setNewConfirmPassword(e.target.value)}
                required
                placeholder="Re-enter password"
                minLength={8}
                disabled={creating}
              />
              {passwordError && <div className="error-message">{passwordError}</div>}
            </div>
            <div className="form-group">
              <label htmlFor="new-role">Role</label>
              <select
                id="new-role"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                disabled={creating}
              >
                {VALID_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn-primary" disabled={creating}>
              {creating ? 'Creating...' : 'Create User'}
            </button>
          </form>
        </div>

        {loading ? (
          <p className="loading-text">Loading users...</p>
        ) : (
          <div className="admin-users-table-wrapper">
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.username}</td>
                    <td>{u.email}</td>
                    <td>
                      {u.id === user?.id ? (
                        <span title="You cannot change your own role">{u.role.replace(/_/g, ' ')} (you)</span>
                      ) : (
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                          disabled={updatingUserId === u.id}
                          aria-label={`Role for ${u.username}`}
                        >
                          {VALID_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {role.replace(/_/g, ' ')}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
