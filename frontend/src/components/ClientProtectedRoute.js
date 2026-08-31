import { Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import useAuthStore from '@/stores/authStore';

const ClientProtectedRoute = ({ children }) => {
  const {
    isAuthenticated,
    isLoading,
    user,
    hasCheckedAuth,
    checkAuth,
  } = useAuthStore();

  const location = useLocation();

  useEffect(() => {
    if (!hasCheckedAuth) {
      checkAuth();
    }
  }, [hasCheckedAuth, checkAuth]);

  // IMPORTANT:
  // Never render redirects or portal content until the initial
  // authentication check has completed.
  if (!hasCheckedAuth || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] dark:bg-[#09090B]">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#0EA5E9] border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/client-portal/login"
        state={{ from: location }}
        replace
      />
    );
  }

  // Only client accounts can access the Client Portal.
  if (user?.role !== 'client') {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

export default ClientProtectedRoute;
