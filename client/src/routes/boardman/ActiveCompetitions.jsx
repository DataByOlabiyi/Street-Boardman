import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import TopBar from '../../components/TopBar';
import BottomNav from '../../components/BottomNav';

export default function ActiveCompetitions() {
  const [competitions, setCompetitions] = useState([]);

  useEffect(() => {
    api.get('/competitions/mine/list').then((d) => setCompetitions(d.competitions));
  }, []);

  return (
    <>
      <TopBar title="My Competitions" />
      <div className="page">
        {competitions.length === 0 && <p className="muted">You haven't created any competitions yet.</p>}
        {competitions.map((c) => (
          <Link
            key={c.id}
            to={`/boardman/competitions/${c.id}`}
            className="card"
            style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{c.title}</strong>
              <span className="badge badge-open">{c.status.replace('_', ' ')}</span>
            </div>
            <p className="muted">{c.category} · Closes {new Date(c.bettingDeadline).toLocaleString()}</p>
          </Link>
        ))}
      </div>
      <BottomNav role="BOARDMAN" />
    </>
  );
}
