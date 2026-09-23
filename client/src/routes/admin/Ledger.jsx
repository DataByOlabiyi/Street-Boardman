import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import TopBar from '../../components/TopBar';
import BottomNav from '../../components/BottomNav';

export default function Ledger() {
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    api.get('/admin/ledger').then((d) => setTransactions(d.transactions));
  }, []);

  return (
    <>
      <TopBar title="Financial Ledger" />
      <div className="page">
        {transactions.map((t) => (
          <div key={t.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{t.type.replace('_', ' ')}</span>
              <strong>{Number(t.amount) >= 0 ? '+' : ''}₦{Number(t.amount).toLocaleString()}</strong>
            </div>
            <p className="muted">{t.wallet.walletType} — {t.wallet.user?.fullName || 'Platform'}</p>
            <p className="muted">{new Date(t.createdAt).toLocaleString()}</p>
          </div>
        ))}
      </div>
      <BottomNav role="ADMIN" />
    </>
  );
}
