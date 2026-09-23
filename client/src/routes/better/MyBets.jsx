import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import TopBar from '../../components/TopBar';
import BottomNav from '../../components/BottomNav';

const STATUS_BADGE = {
  OPEN: 'badge-pending',
  WON: 'badge-won',
  LOST: 'badge-lost',
  REFUNDED: 'badge-closed',
  VOID: 'badge-closed',
};

export default function MyBets() {
  const [bets, setBets] = useState([]);

  useEffect(() => {
    api.get('/bets/me').then((d) => setBets(d.bets));
  }, []);

  return (
    <>
      <TopBar title="My Bets" />
      <div className="page">
        {bets.length === 0 && <p className="muted">You haven't placed any bets yet.</p>}
        {bets.map((bet) => (
          <Link
            key={bet.id}
            to={`/better/my-bets/${bet.betCode}`}
            className="card"
            style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{bet.betCode}</strong>
              <span className={`badge ${STATUS_BADGE[bet.status]}`}>{bet.status}</span>
            </div>
            <p className="muted">{bet.betOption.competition.title} — {bet.betOption.label}</p>
            <p>Stake: ₦{Number(bet.stake).toLocaleString()}</p>
          </Link>
        ))}
      </div>
      <BottomNav role="BETTER" />
    </>
  );
}
