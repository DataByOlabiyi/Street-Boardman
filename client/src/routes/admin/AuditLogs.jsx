import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import TopBar from '../../components/TopBar';
import BottomNav from '../../components/BottomNav';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    api.get('/admin/audit-logs').then((d) => setLogs(d.logs));
  }, []);

  return (
    <>
      <TopBar title="Audit Logs" />
      <div className="page">
        {logs.map((log) => (
          <div key={log.id} className="card">
            <strong>{log.action}</strong>
            <p className="muted">{log.entityType} · {log.entityId}</p>
            <p className="muted">{new Date(log.createdAt).toLocaleString()}</p>
          </div>
        ))}
      </div>
      <BottomNav role="ADMIN" />
    </>
  );
}
