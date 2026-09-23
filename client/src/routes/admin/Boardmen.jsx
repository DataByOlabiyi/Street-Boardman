import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import TopBar from '../../components/TopBar';
import BottomNav from '../../components/BottomNav';

export default function Boardmen() {
  const [boardmen, setBoardmen] = useState([]);
  const [error, setError] = useState('');

  const load = () => api.get('/admin/boardmen').then((d) => setBoardmen(d.boardmen));
  useEffect(() => { load(); }, []);

  const act = async (id, action) => {
    setError('');
    try {
      await api.patch(`/admin/boardmen/${id}/${action}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <TopBar title="Boardmen" />
      <div className="page">
        {error && <div className="error-banner">{error}</div>}
        {boardmen.map((b) => (
          <div key={b.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{b.user.fullName}</strong>
              <span className={`badge ${b.approvalStatus === 'APPROVED' ? 'badge-open' : 'badge-pending'}`}>
                {b.approvalStatus}
              </span>
            </div>
            <p className="muted">{b.user.phone} · {b.businessLocation}</p>
            {b.approvalStatus === 'PENDING_APPROVAL' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn btn-primary" style={{ margin: 0 }} onClick={() => act(b.id, 'approve')}>Approve</button>
                <button className="btn btn-danger" style={{ margin: 0 }} onClick={() => act(b.id, 'reject')}>Reject</button>
              </div>
            )}
            {b.approvalStatus === 'APPROVED' && (
              <button className="btn btn-danger" style={{ marginTop: 8 }} onClick={() => act(b.id, 'suspend')}>Suspend</button>
            )}
          </div>
        ))}
      </div>
      <BottomNav role="ADMIN" />
    </>
  );
}
