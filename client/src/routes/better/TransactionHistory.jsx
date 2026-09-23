import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import TopBar from '../../components/TopBar';
import BottomNav from '../../components/BottomNav';

export default function TransactionHistory() {
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    api.get('/wallet/me/transactions').then((d) => setTransactions(d.transactions));
  }, []);

  return (
    <>
      <TopBar title="Transaction History" />
      <div className="page">
        {transactions.length === 0 && <p className="muted">No transactions yet.</p>}
        {transactions.map((t) => (
          <div key={t.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{t.type.replace('_', ' ')}</span>
              <strong style={{ color: Number(t.amount) >= 0 ? 'var(--color-primary)' : 'var(--color-danger)' }}>
                {Number(t.amount) >= 0 ? '+' : ''}₦{Number(t.amount).toLocaleString()}
              </strong>
            </div>
            <p className="muted">Balance after: ₦{Number(t.balanceAfter).toLocaleString()}</p>
            <p className="muted">{new Date(t.createdAt).toLocaleString()}</p>
          </div>
        ))}
      </div>
      <BottomNav role="BETTER" />
    </>
  );
}
