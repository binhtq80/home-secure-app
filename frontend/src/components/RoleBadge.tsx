import { useAuth } from '../contexts/AuthContext';

export function RoleBadge() {
  const { user } = useAuth();

  if (!user?.role) return null;

  const label = user.role.replace(/_/g, ' ');

  return (
    <span className="role-badge" title={`Your role: ${label}`}>
      {label}
    </span>
  );
}
