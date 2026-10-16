import { Navigate, Outlet, useLocation } from 'react-router';
import { can } from '@yamon/shared';
import { useCurrentUser } from '../lib/auth';

/** /login 以外はログイン必須 */
export function RequireAuth() {
  const user = useCurrentUser();
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}

/** /admin は管理者のみ（画面の出し分けだけ。API でも権限を確かめる）。それ以外の役割はホームへ戻す */
export function RequireAdmin() {
  const user = useCurrentUser();
  if (!user || !can(user.role, 'users.manage')) return <Navigate to="/" replace />;
  return <Outlet />;
}
