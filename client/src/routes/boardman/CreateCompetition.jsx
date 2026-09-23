import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import TopBar from '../../components/TopBar';
import BottomNav from '../../components/BottomNav';

const CATEGORIES = ['FOOTBALL', 'SNOOKER', 'FIGHT', 'TABLE_GAME', 'OTHER'];

function toLocalDatetimeInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function CreateCompetition() {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('FOOTBALL');
  const [description, setDescription] = useState('');
  const [participantA, setParticipantA] = useState('');
  const [participantB, setParticipantB] = useState('');
  const [bettingDeadline, setBettingDeadline] = useState(
    toLocalDatetimeInputValue(new Date(Date.now() + 3 * 60 * 60 * 1000))
  );
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { competition } = await api.post('/competitions', {
        title,
        category,
        description,
        bettingDeadline: new Date(bettingDeadline).toISOString(),
        participants: [participantA, participantB].filter(Boolean),
        options: [`${participantA} wins`, `${participantB} wins`],
      });
      navigate(`/boardman/active`, { state: { createdId: competition.id } });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <TopBar title="Create Competition" />
      <div className="page">
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={onSubmit}>
          <div className="field">
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Tunde vs Seyi" required />
          </div>
          <div className="field">
            <label>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Participant A</label>
            <input value={participantA} onChange={(e) => setParticipantA(e.target.value)} placeholder="e.g. Tunde" required />
          </div>
          <div className="field">
            <label>Participant B</label>
            <input value={participantB} onChange={(e) => setParticipantB(e.target.value)} placeholder="e.g. Seyi" required />
          </div>
          <div className="field">
            <label>Betting deadline</label>
            <input type="datetime-local" value={bettingDeadline} onChange={(e) => setBettingDeadline(e.target.value)} required />
          </div>
          <div className="field">
            <label>Notes (optional)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Competition'}
          </button>
        </form>
      </div>
      <BottomNav role="BOARDMAN" />
    </>
  );
}
