import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import TopBar from '../../components/TopBar';
import BottomNav from '../../components/BottomNav';

export default function AdminCompetitions() {
  const [competitions, setCompetitions] = useState([]);

  useEffect(() => {
    api.get('/admin/competitions').then((d) => setCompetitions(d.competitions));
  }, []);

  return (
    <>
      <TopBar title="All Competitions" />
      <div className="page">
        {competitions.map((c) => (
          <div key={c.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{c.title}</strong>
              <span className="badge badge-open">{c.status.replace('_', ' ')}</span>
            </div>
            <p className="muted">Boardman: {c.boardmanProfile.user.fullName} ({c.boardmanProfile.user.phone})</p>
            <p className="muted">{c.category} · Closes {new Date(c.bettingDeadline).toLocaleString()}</p>
          </div>
        ))}
      </div>
      <BottomNav role="ADMIN" />
    </>
  );
}
