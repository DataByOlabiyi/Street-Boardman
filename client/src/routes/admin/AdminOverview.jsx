import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import TopBar from '../../components/TopBar';
import BottomNav from '../../components/BottomNav';

export default function AdminOverview() {
  const { user } = useAuth();
  const [overview, setOverview] = useState(null);

  useEffect(() => {
    api.get('/admin/overview').then(setOverview);
  }, []);

  if (!overview) return <div className="page">Loading...</div>;

  return (
    <>
      <TopBar title="Platform Overview" />
      <div className="page">
        {user && !user.mfaEnabled && (
          <div className="error-banner">
            Two-factor authentication is off for your account. <Link to="/admin/security">Turn it on</Link>
          </div>
        )}
        <div className="card">
          <p className="muted">Platform revenue (commission wallet)</p>
          <h1>₦{Number(overview.platformRevenue).toLocaleString()}</h1>
        </div>
        <div className="card"><span className="muted">Registered Betters</span><strong style={{ float: 'right' }}>{overview.userCount}</strong></div>
        <div className="card"><span className="muted">Boardmen</span><strong style={{ float: 'right' }}>{overview.boardmanCount}</strong></div>
        <div className="card"><span className="muted">Competitions</span><strong style={{ float: 'right' }}>{overview.competitionCount}</strong></div>
        <div className="card"><span className="muted">Total bets placed</span><strong style={{ float: 'right' }}>{overview.betCount}</strong></div>

        <h2 style={{ marginTop: 24 }}>Manage</h2>
        <Link to="/admin/users" className="btn btn-secondary">Users</Link>
        <Link to="/admin/competitions" className="btn btn-secondary">All Competitions</Link>
        <Link to="/admin/ledger" className="btn btn-secondary">Financial Ledger</Link>
        <Link to="/admin/audit-logs" className="btn btn-secondary">Audit Logs</Link>
        <Link to="/admin/security" className="btn btn-secondary">Account Security</Link>
      </div>
      <BottomNav role="ADMIN" />
    </>
  );
}
