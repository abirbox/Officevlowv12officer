import { Navigate, useLocation } from 'react-router-dom';
import useAuthStore from '@/stores/authStore';
import { useEffect } from 'react';

const ProtectedRoute = ({ children }) => {
  const {
    isAuthenticated,
    isLoading,
    hasCheckedAuth,
    user,
    checkAuth,
  } = useAuthStore();

  const location = useLocation();

  useEffect(() => {
    if (!hasCheckedAuth) {
      checkAuth();
    }
  }, [hasCheckedAuth, checkAuth]);

  // Wait until authentication has been conclusively checked.
  if (!hasCheckedAuth || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] dark:bg-[#09090B]">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-[#0EA5E9] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-[#64748B] dark:text-[#A1A1AA] font-medium">
            Loading...
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        state={{ from: location }}
        replace
      />
    );
  }

  // Clients belong to the dedicated Client Portal.
  if (user?.role === 'client') {
    return <Navigate to="/client-portal/dashboard" replace />;
  }

  return children;
};

export default ProtectedRoute;
