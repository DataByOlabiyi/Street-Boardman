import { useAuth } from '../../context/AuthContext';
import TopBar from '../../components/TopBar';
import BottomNav from '../../components/BottomNav';

export default function BoardmanProfile() {
  const { user, boardmanProfile } = useAuth();

  return (
    <>
      <TopBar title="Boardman Profile" />
      <div className="page">
        <div className="card">
          <p className="muted">Full name</p>
          <strong>{user?.fullName}</strong>
        </div>
        <div className="card">
          <p className="muted">Phone number</p>
          <strong>{user?.phone}</strong>
        </div>
        <div className="card">
          <p className="muted">Location</p>
          <strong>{boardmanProfile?.businessLocation}</strong>
        </div>
        <div className="card">
          <p className="muted">Approval status</p>
          <strong>{boardmanProfile?.approvalStatus}</strong>
        </div>
        {boardmanProfile?.commissionRateOverride != null && (
          <div className="card">
            <p className="muted">Your commission rate (set by Admin)</p>
            <strong>{(boardmanProfile.commissionRateOverride * 100).toFixed(1)}%</strong>
          </div>
        )}
      </div>
      <BottomNav role="BOARDMAN" />
    </>
  );
}
