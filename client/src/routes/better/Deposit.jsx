import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import TopBar from '../../components/TopBar';
import BottomNav from '../../components/BottomNav';

export default function Deposit() {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/deposits/demo', { amount: Number(amount) });
      setSuccess(`₦${Number(amount).toLocaleString()} added to your wallet.`);
      setTimeout(() => navigate('/better/wallet'), 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <TopBar title="Deposit" />
      <div className="page">
        <div className="card">
          <strong>DEMO MODE</strong>
          <p className="muted">This adds test money to your wallet instantly. No real payment is taken.</p>
        </div>
        {error && <div className="error-banner">{error}</div>}
        {success && <div className="success-banner">{success}</div>}
        <form onSubmit={onSubmit}>
          <div className="field">
            <label>Amount (₦)</label>
            <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Processing...' : 'Deposit'}
          </button>
        </form>
      </div>
      <BottomNav role="BETTER" />
    </>
  );
}
