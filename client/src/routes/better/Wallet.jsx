import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import TopBar from '../../components/TopBar';
import BottomNav from '../../components/BottomNav';

export default function Wallet() {
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    api.get('/wallet/me').then((d) => setWallet(d.wallet));
    api.get('/wallet/me/transactions').then((d) => setTransactions(d.transactions.slice(0, 10)));
  }, []);

  return (
    <>
      <TopBar title="Wallet" />
      <div className="page">
        <div className="card">
          <p className="muted">Balance</p>
          <h1>₦{wallet ? Number(wallet.balance).toLocaleString() : '...'}</h1>
        </div>
        <Link to="/better/deposit" className="btn btn-primary">Deposit</Link>
        <Link to="/better/withdraw" className="btn btn-secondary">Withdraw</Link>

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
        <Link to="/better/transactions" className="btn btn-secondary">Full transaction history</Link>
      </div>
      <BottomNav role="BETTER" />
    </>
  );
}
