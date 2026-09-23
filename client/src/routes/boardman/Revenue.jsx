import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import TopBar from '../../components/TopBar';
import BottomNav from '../../components/BottomNav';

export default function Revenue() {
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    api.get('/wallet/me/transactions').then((d) => setTransactions(d.transactions.filter((t) => t.type === 'COMMISSION')));
  }, []);

  const total = transactions.reduce((sum, t) => sum + Number(t.amount), 0);

  return (
    <>
      <TopBar title="Revenue & Commission" />
      <div className="page">
        <div className="card">
          <p className="muted">Total commission earned</p>
          <h1>₦{total.toLocaleString()}</h1>
        </div>
        <h2>Commission history</h2>
        {transactions.length === 0 && <p className="muted">No commission earned yet — it lands here once a competition is completed.</p>}
        {transactions.map((t) => (
          <div key={t.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{t.note}</span>
              <strong>+₦{Number(t.amount).toLocaleString()}</strong>
            </div>
            <p className="muted">{new Date(t.createdAt).toLocaleString()}</p>
          </div>
        ))}
      </div>
      <BottomNav role="BOARDMAN" />
    </>
  );
}
