import { useAuth } from '../../context/AuthContext';
import TopBar from '../../components/TopBar';
import BottomNav from '../../components/BottomNav';

export default function Profile() {
  const { user } = useAuth();

  return (
    <>
      <TopBar title="Profile" />
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
          <p className="muted">Account status</p>
          <strong>{user?.status}</strong>
        </div>
        <div className="card">
          <p className="muted">Need help?</p>
          <p>Contact support through your Boardman, or reach the platform support line listed in the app footer.</p>
        </div>
      </div>
      <BottomNav role="BETTER" />
    </>
  );
}
