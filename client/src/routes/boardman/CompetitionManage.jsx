import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../api/client';
import TopBar from '../../components/TopBar';
import BottomNav from '../../components/BottomNav';

export default function CompetitionManage() {
  const { id } = useParams();
  const [competition, setCompetition] = useState(null);
  const [bets, setBets] = useState([]);
  const [winningOptionId, setWinningOptionId] = useState('');
  const [finalScore, setFinalScore] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    api.get(`/competitions/${id}`).then((d) => setCompetition(d.competition));
    api.get(`/competitions/${id}/bets`).then((d) => setBets(d.bets)).catch(() => {});
  };

  useEffect(() => { load(); }, [id]);

  const totalStaked = bets.reduce((sum, b) => sum + Number(b.stake), 0);

  const onCloseBetting = async () => {
    setError('');
    try {
      await api.patch(`/competitions/${id}/close-betting`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const onSubmitResult = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post(`/competitions/${id}/result`, { winningOptionId, finalScore, notes });
      setMessage('Result submitted. It will be confirmed automatically if nobody disputes it within the confirmation window.');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!competition) return <div className="page">Loading...</div>;

  return (
    <>
      <TopBar title={competition.title} />
      <div className="page">
        <span className="badge badge-open">{competition.status.replace('_', ' ')}</span>
        <p className="muted" style={{ marginTop: 8 }}>
          Betting deadline: {new Date(competition.bettingDeadline).toLocaleString()}
        </p>

        {error && <div className="error-banner">{error}</div>}
        {message && <div className="success-banner">{message}</div>}

        <div className="card">
          <p className="muted">Total staked so far</p>
          <h2>₦{totalStaked.toLocaleString()}</h2>
          <p className="muted">{bets.length} bet(s) received</p>
        </div>

        {competition.status === 'BETTING_OPEN' && (
          <button className="btn btn-danger" onClick={onCloseBetting}>Close Betting</button>
        )}

        {competition.status === 'BETTING_CLOSED' && (
          <>
            <h2>Submit Result</h2>
            <form onSubmit={onSubmitResult}>
              {competition.betOptions.map((opt) => (
                <label key={opt.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input
                    type="radio"
                    name="winner"
                    value={opt.id}
                    checked={winningOptionId === opt.id}
                    onChange={() => setWinningOptionId(opt.id)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
              <div className="field">
                <label>Final score (optional)</label>
                <input value={finalScore} onChange={(e) => setFinalScore(e.target.value)} placeholder="e.g. 2-1" />
              </div>
              <div className="field">
                <label>Notes (optional)</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              </div>
              <button className="btn btn-primary" type="submit" disabled={!winningOptionId || submitting}>
                {submitting ? 'Submitting...' : 'Submit Result'}
              </button>
            </form>
          </>
        )}

        {['PENDING_CONFIRMATION', 'DISPUTED', 'RESULT_CONFIRMED', 'PAYOUT_PROCESSING', 'COMPLETED'].includes(competition.status) && (
          <div className="card">
            <p className="muted">Result status</p>
            <strong>{competition.result?.status}</strong>
            {competition.status === 'DISPUTED' && (
              <p style={{ marginTop: 8 }}>
                This result is disputed. Only the Platform Admin can resolve it now — you cannot confirm your own
                disputed result.
              </p>
            )}
          </div>
        )}

        <h2 style={{ marginTop: 24 }}>Bets received</h2>
        {bets.length === 0 && <p className="muted">No bets yet.</p>}
        {bets.slice(0, 20).map((bet) => (
          <div key={bet.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{bet.better.fullName}</span>
              <strong>₦{Number(bet.stake).toLocaleString()}</strong>
            </div>
            <p className="muted">{bet.betOption.label} · {bet.betCode}</p>
          </div>
        ))}
      </div>
      <BottomNav role="BOARDMAN" />
    </>
  );
}
