import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import TopBar from '../../components/TopBar';
import BottomNav from '../../components/BottomNav';

export default function Disputes() {
  const [disputes, setDisputes] = useState([]);
  const [error, setError] = useState('');

  const load = () => api.get('/admin/disputes').then((d) => setDisputes(d.disputes));
  useEffect(() => { load(); }, []);

  const resolve = async (id, action) => {
    setError('');
    try {
      await api.patch(`/admin/disputes/${id}/resolve`, { action });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <TopBar title="Disputes" />
      <div className="page">
        {error && <div className="error-banner">{error}</div>}
        {disputes.length === 0 && <p className="muted">No disputes.</p>}
        {disputes.map((d) => (
          <div key={d.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{d.competition.title}</strong>
              <span className={`badge ${d.status === 'OPEN' ? 'badge-disputed' : 'badge-closed'}`}>{d.status}</span>
            </div>
            <p className="muted">Raised by {d.raisedByUser.fullName} ({d.raisedByUser.phone})</p>
            <p>{d.reason}</p>
            {(d.status === 'OPEN' || d.status === 'UNDER_REVIEW') && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn btn-primary" style={{ margin: 0 }} onClick={() => resolve(d.id, 'CONFIRM')}>
                  Confirm Result & Pay Out
                </button>
                <button className="btn btn-danger" style={{ margin: 0 }} onClick={() => resolve(d.id, 'CANCEL')}>
                  Cancel & Refund
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <BottomNav role="ADMIN" />
    </>
  );
}
