import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api/client';
import TopBar from '../../components/TopBar';
import BottomNav from '../../components/BottomNav';

export default function BetTicket() {
  const { betCode } = useParams();
  const [bet, setBet] = useState(null);

  useEffect(() => {
    api.get(`/bets/${betCode}`).then((d) => setBet(d.bet));
  }, [betCode]);

  if (!bet) return <div className="page">Loading...</div>;

  return (
    <>
      <TopBar title="Bet Ticket" />
      <div className="page">
        <div className="ticket">
          <div className="ticket-row"><span>BET ID</span><strong>{bet.betCode}</strong></div>
          <div className="ticket-row"><span>Competition</span><strong>{bet.betOption.competition.title}</strong></div>
          <div className="ticket-row"><span>Selection</span><strong>{bet.betOption.label}</strong></div>
          <div className="ticket-row"><span>Stake</span><strong>₦{Number(bet.stake).toLocaleString()}</strong></div>
          <div className="ticket-row"><span>Estimated payout</span><strong>₦{Number(bet.potentialPayout).toLocaleString()}</strong></div>
          <div className="ticket-row"><span>Status</span><strong>{bet.status}</strong></div>
        </div>
        <p className="muted" style={{ marginTop: 12 }}>
          The estimated payout can change until betting closes — it depends on how much everyone else stakes.
          Your final winnings are confirmed once the result is settled.
        </p>
        <Link to="/better/my-bets" className="btn btn-secondary">Back to My Bets</Link>
      </div>
      <BottomNav role="BETTER" />
    </>
  );
}
