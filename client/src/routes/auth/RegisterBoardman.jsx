import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function RegisterBoardman() {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [businessLocation, setBusinessLocation] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { refresh } = useAuth();
  const navigate = useNavigate();

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await api.post('/auth/register/boardman', { fullName, phone, pin, businessLocation });
      setMessage(res.message);
      await refresh();
      setTimeout(() => navigate('/boardman'), 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <h1>Become a Boardman</h1>
      <p className="muted">
        New Boardman accounts start as PENDING_APPROVAL. An Admin reviews and approves you before you can run
        real competitions.
      </p>
      {error && <div className="error-banner">{error}</div>}
      {message && <div className="success-banner">{message}</div>}
      <form onSubmit={onSubmit}>
        <div className="field">
          <label>Full name</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>
        <div className="field">
          <label>Phone number</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" required />
        </div>
        <div className="field">
          <label>Choose a PIN (4+ digits)</label>
          <input value={pin} onChange={(e) => setPin(e.target.value)} type="password" required />
        </div>
        <div className="field">
          <label>Location</label>
          <input
            value={businessLocation}
            onChange={(e) => setBusinessLocation(e.target.value)}
            placeholder="e.g. Yaba, Lagos"
            required
          />
        </div>
        <button className="btn btn-primary" disabled={submitting} type="submit">
          {submitting ? 'Submitting...' : 'Apply as Boardman'}
        </button>
      </form>
      <p className="muted">
        Already registered? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
