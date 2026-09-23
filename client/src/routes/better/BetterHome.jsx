import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import TopBar from '../../components/TopBar';
import BottomNav from '../../components/BottomNav';
import { useAuth } from '../../context/AuthContext';

export default function BetterHome() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState(null);
  const [competitions, setCompetitions] = useState([]);

  useEffect(() => {
    api.get('/wallet/me').then((d) => setWallet(d.wallet));
    api.get('/competitions').then((d) => setCompetitions(d.competitions.slice(0, 3)));
  }, []);

  return (
    <>
      <TopBar title="StreetBoardman" />
      <div className="page">
        <h1>Welcome, {user?.fullName}</h1>

        <div className="card">
          <p className="muted">Wallet balance</p>
          <h2>₦{wallet ? Number(wallet.balance).toLocaleString() : '...'}</h2>
          <Link to="/better/deposit" className="btn btn-primary" style={{ marginTop: 8 }}>Deposit</Link>
        </div>

        <h2>Open competitions</h2>
        {competitions.length === 0 && <p className="muted">No competitions open right now.</p>}
        {competitions.map((c) => (
          <Link key={c.id} to={`/better/competitions/${c.id}`} className="card" style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
            <strong>{c.title}</strong>
            <p className="muted">{c.category} · Betting closes {new Date(c.bettingDeadline).toLocaleString()}</p>
          </Link>
        ))}
        <Link to="/better/competitions" className="btn btn-secondary">See all competitions</Link>
      </div>
      <BottomNav role="BETTER" />
    </>
  );
}
