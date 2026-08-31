import { Navigate, useLocation } from 'react-router-dom';
import useAuthStore from '@/stores/authStore';
import { useEffect } from 'react';

const GuestRoute = ({ children }) => {
  const { isAuthenticated, user, checkAuth } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    // Verify the server session in the background. We do NOT block the guest
    // page on this: an unauthenticated visitor to /login should see the form
    // immediately, and we only redirect away once we positively know they are
    // already signed in. This keeps the login screen resilient to a slow or
    // stalled /auth/me round-trip.
    checkAuth();
  }, [checkAuth]);

  if (isAuthenticated) {
    return (
      <Navigate
        to={user?.role === 'client' ? '/client-portal/dashboard' : '/dashboard'}
        state={{ fromGuestRoute: location.pathname }}
        replace
      />
    );
  }

  return children;
};

export default GuestRoute;
