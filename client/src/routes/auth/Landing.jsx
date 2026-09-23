import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="landing">
      <h1>StreetBoardman</h1>
      <p className="muted">The digital street Boardman — local competitions, real bets, honest payouts.</p>

      <div className="role-choice">
        <Link to="/register/better" className="btn btn-primary">BETTER</Link>
        <p className="muted">Place bets on local competitions</p>

        <Link to="/register/boardman" className="btn btn-secondary" style={{ marginTop: 20 }}>
          BECOME A BOARDMAN
        </Link>
        <p className="muted">Create and manage local competitions</p>

        <Link to="/login" style={{ display: 'block', marginTop: 24, color: 'var(--color-primary)' }}>
          Already have an account? Log in
        </Link>
      </div>
    </div>
  );
}
