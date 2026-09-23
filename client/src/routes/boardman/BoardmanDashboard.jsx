import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import TopBar from '../../components/TopBar';
import BottomNav from '../../components/BottomNav';
import { useAuth } from '../../context/AuthContext';

export default function BoardmanDashboard() {
  const { user, boardmanProfile } = useAuth();
  const [wallet, setWallet] = useState(null);
  const [competitions, setCompetitions] = useState([]);

  useEffect(() => {
    api.get('/wallet/me').then((d) => setWallet(d.wallet));
    api.get('/competitions/mine/list').then((d) => setCompetitions(d.competitions));
  }, []);

  const isApproved = boardmanProfile?.approvalStatus === 'APPROVED';

  return (
    <>
      <TopBar title="Boardman Dashboard" />
      <div className="page">
        <h1>Welcome, {user?.fullName}</h1>

        {!isApproved && (
          <div className="error-banner">
            Your account is {boardmanProfile?.approvalStatus}. You can't create real competitions until an Admin
            approves you.
          </div>
        )}

        <div className="card">
          <p className="muted">Commission wallet balance</p>
          <h2>₦{wallet ? Number(wallet.balance).toLocaleString() : '...'}</h2>
        </div>

        <Link to="/boardman/create" className="btn btn-primary">+ Create Competition</Link>

        <h2 style={{ marginTop: 24 }}>Your competitions</h2>
        {competitions.length === 0 && <p className="muted">You haven't created any competitions yet.</p>}
        {competitions.slice(0, 5).map((c) => (
          <div key={c.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{c.title}</strong>
              <span className="badge badge-open">{c.status.replace('_', ' ')}</span>
            </div>
            <p className="muted">{c.category}</p>
          </div>
        ))}
        <Link to="/boardman/active" className="btn btn-secondary">Manage competitions</Link>
      </div>
      <BottomNav role="BOARDMAN" />
    </>
  );
}
