import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import TopBar from '../../components/TopBar';
import BottomNav from '../../components/BottomNav';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');

  const load = () => api.get('/admin/users').then((d) => setUsers(d.users));
  useEffect(() => { load(); }, []);

  const act = async (id, action) => {
    setError('');
    try {
      await api.patch(`/admin/users/${id}/${action}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <TopBar title="Users" />
      <div className="page">
        {error && <div className="error-banner">{error}</div>}
        {users.map((u) => (
          <div key={u.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{u.fullName}</strong>
              <span className={`badge ${u.status === 'ACTIVE' ? 'badge-open' : 'badge-disputed'}`}>{u.status}</span>
            </div>
            <p className="muted">{u.phone} · {u.role}</p>
            {u.role !== 'ADMIN' && (
              u.status === 'ACTIVE' ? (
                <button className="btn btn-danger" style={{ marginTop: 8 }} onClick={() => act(u.id, 'suspend')}>Suspend</button>
              ) : (
                <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => act(u.id, 'reactivate')}>Reactivate</button>
              )
            )}
          </div>
        ))}
      </div>
      <BottomNav role="ADMIN" />
    </>
  );
}
