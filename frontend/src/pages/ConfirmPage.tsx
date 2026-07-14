import { useState, FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';

export function ConfirmPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [username, setUsername] = useState((location.state as { username?: string })?.username || '');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const data = await authApi.confirm(username, code);
      setSuccess(data.message);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Confirmation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>Confirm Email</h1>
        <p className="auth-subtitle">Enter the verification code sent to your email.</p>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your username"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="code">Verification Code</label>
            <input
              id="code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter 6-digit code"
              required
              autoComplete="one-time-code"
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Confirming...' : 'Confirm Email'}
          </button>
        </form>

        <p className="auth-footer">
          <Link to="/login">Back to Sign In</Link>
        </p>
      </div>
    </div>
  );
}
