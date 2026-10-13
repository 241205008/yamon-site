import { Navigate, Outlet, useLocation } from 'react-router';
import { useCurrentUser } from '../lib/store';

/** /login 以外はログイン必須 */
export function RequireAuth() {
  const user = useCurrentUser();
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}

/** /admin は管理者のみ。一般ユーザーはホームへ戻す */
export function RequireAdmin() {
  const user = useCurrentUser();
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  return <Outlet />;
}
