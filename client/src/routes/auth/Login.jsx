import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function Login() {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { refresh } = useAuth();
  const navigate = useNavigate();

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { user } = await api.post('/auth/login', { phone, pin });
      await refresh();
      if (user.role === 'ADMIN') navigate('/admin');
      else if (user.role === 'BOARDMAN') navigate('/boardman');
      else navigate('/better');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <h1>Log In</h1>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={onSubmit}>
        <div className="field">
          <label>Phone number</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" required />
        </div>
        <div className="field">
          <label>PIN / Password</label>
          <input value={pin} onChange={(e) => setPin(e.target.value)} type="password" required />
        </div>
        <button className="btn btn-primary" disabled={submitting} type="submit">
          {submitting ? 'Logging in...' : 'Log In'}
        </button>
      </form>
      <p className="muted">
        No account? <Link to="/">Register</Link>
      </p>
    </div>
  );
}
