/**
 * Backward-compatible alias for shopping session auth.
 * New code should use useShoppingSession() or useSession().
 */
import { useSession, useShoppingSession } from './SessionContext';

export { SessionProvider, SessionProvider as AuthProvider } from './SessionContext';
export { useSession, useShoppingSession, useLearningCustomer } from './SessionContext';

export function useAuth() {
  const { isLoading, shopping } = useSession();
  return {
    user: shopping.user,
    isAuthenticated: shopping.isAuthenticated,
    isLoading,
    login: shopping.signInDev,
    logout: shopping.signOut,
  };
}
