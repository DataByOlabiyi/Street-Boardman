import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import TopBar from '../../components/TopBar';
import BottomNav from '../../components/BottomNav';

export default function BoardmanWallet() {
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    api.get('/wallet/me').then((d) => setWallet(d.wallet));
    api.get('/wallet/me/transactions').then((d) => setTransactions(d.transactions.slice(0, 10)));
  }, []);

  return (
    <>
      <TopBar title="Boardman Wallet" />
      <div className="page">
        <div className="card">
          <p className="muted">Balance</p>
          <h1>₦{wallet ? Number(wallet.balance).toLocaleString() : '...'}</h1>
        </div>
        <Link to="/boardman/withdraw" className="btn btn-primary">Withdraw</Link>
        <Link to="/boardman/revenue" className="btn btn-secondary">View Commission History</Link>

        <h2 style={{ marginTop: 24 }}>Recent activity</h2>
        {transactions.map((t) => (
          <div key={t.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{t.type.replace('_', ' ')}</span>
              <strong style={{ color: Number(t.amount) >= 0 ? 'var(--color-primary)' : 'var(--color-danger)' }}>
                {Number(t.amount) >= 0 ? '+' : ''}₦{Number(t.amount).toLocaleString()}
              </strong>
            </div>
            <p className="muted">{new Date(t.createdAt).toLocaleString()}</p>
          </div>
        ))}
      </div>
      <BottomNav role="BOARDMAN" />
    </>
  );
}
