import { NavLink } from 'react-router-dom';

const NAV_ITEMS = {
  BETTER: [
    { to: '/better', label: 'Home', end: true },
    { to: '/better/competitions', label: 'Bet' },
    { to: '/better/my-bets', label: 'My Bets' },
    { to: '/better/wallet', label: 'Wallet' },
    { to: '/better/profile', label: 'Profile' },
  ],
  BOARDMAN: [
    { to: '/boardman', label: 'Dashboard', end: true },
    { to: '/boardman/create', label: 'Create' },
    { to: '/boardman/active', label: 'Active' },
    { to: '/boardman/wallet', label: 'Wallet' },
    { to: '/boardman/profile', label: 'Profile' },
  ],
  ADMIN: [
    { to: '/admin', label: 'Overview', end: true },
    { to: '/admin/boardmen', label: 'Boardmen' },
    { to: '/admin/disputes', label: 'Disputes' },
    { to: '/admin/settings', label: 'Settings' },
  ],
};

export default function BottomNav({ role }) {
  const items = NAV_ITEMS[role] || [];
  return (
    <nav className="bottom-nav">
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
