import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import useAuthStore from '@/stores/authStore';
import { useTheme } from '@/contexts/ThemeContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { api } from '@/lib/axios';
import {
  LayoutDashboard,
  Building2,
  CalendarDays,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  Search,
  Shield,
  Users,
  CalendarClock,
  DollarSign,
  Wallet,
  MapPin,
  ChevronDown,
  User,
} from 'lucide-react';
import { ScopeProvider } from '@/lib/scopedApi';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import NotificationBell from '@/components/NotificationBell';
import TimezoneMenu from '@/components/TimezoneMenu';

const navItems = [
  { name: 'Dashboard', href: '/client-portal/dashboard', icon: LayoutDashboard, end: true },
  { name: "Today's Dispatch", href: '/client-portal/today', icon: CalendarClock },
  { name: 'Dispatch Schedule', href: '/client-portal/schedules', icon: Users },
  { name: 'Dispatch Calendar', href: '/client-portal/calendar', icon: CalendarDays },
  { name: 'Security Officers', href: '/client-portal/officers', icon: Shield },
  { name: 'Post Sites', href: '/client-portal/post-sites', icon: MapPin },
  { name: 'Vendors', href: '/client-portal/vendors', icon: Building2 },
  { name: 'Payment SO', href: '/client-portal/payments', icon: DollarSign },
  { name: 'Wage Report', href: '/client-portal/wage-report', icon: Wallet },
  { name: 'Invoices', href: '/client-portal/invoices', icon: FileText },
  { name: 'Company Profile', href: '/client-portal/profile', icon: Settings },
];

const NavigationItem = ({ item, mobile = false, sidebarOpen, setMobileMenuOpen }) => {
    const Icon = item.icon;

    return (
      <NavLink
        to={item.href}
        end={item.end === true}
        onClick={() => {
          if (mobile) {
            setMobileMenuOpen(false);
          }
        }}
        data-testid={`${
          mobile ? 'mobile-' : ''
        }client-nav-${item.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '')}`}
        className={({ isActive }) =>
          `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
            isActive
              ? 'bg-[#0EA5E9] text-white'
              : 'text-[#64748B] dark:text-[#A1A1AA] hover:bg-[#F1F5F9] dark:hover:bg-[#27272A] hover:text-[#0F172A] dark:hover:text-[#FAFAFA]'
          }`
        }
      >
        <Icon className="w-5 h-5 flex-shrink-0" />

        {mobile ? (
          <span className="text-sm font-medium">{item.name}</span>
        ) : (
          sidebarOpen && (
            <span className="text-sm font-medium">
              {item.name}
            </span>
          )
        )}
      </NavLink>
    );
  };

const SidebarBrand = ({ sidebarOpen, brandLogo, brandName }) => (
    <>
      {sidebarOpen && (
        <div
          className="flex items-center gap-2 min-w-0"
          data-testid="client-app-logo"
        >
          {brandLogo ? (
            <div className="min-w-0">
              <img
                src={brandLogo}
                alt={brandName}
                className="h-9 max-w-[170px] object-contain"
                data-testid="client-app-logo-img"
              />
              <div className="text-[9px] uppercase tracking-wider text-[#0EA5E9] dark:text-[#A5B4FC] font-semibold mt-0.5">
                Client Portal
              </div>
            </div>
          ) : (
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-[#0F172A] dark:text-[#FAFAFA] tracking-tight truncate">
                {brandName}
              </h1>
              <p className="text-[10px] uppercase tracking-wider text-[#0EA5E9] dark:text-[#A5B4FC] font-semibold">
                Client Portal
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );

const ClientPortalLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [clientName, setClientName] = useState('');

  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useTheme();
  const { settings } = useAppSettings();

  const navigate = useNavigate();
  const location = useLocation();

  const brandName = settings?.brand_name || 'OfficeFlow';
  const brandLogo = settings?.brand_logo_url || null;

  useEffect(() => {
    api
      .get('/portal/me')
      .then(({ data }) => {
        setClientName(data?.client?.name || user?.name || '');
      })
      .catch(() => {
        setClientName(user?.name || '');
      });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/client-portal/login');
  };

  const isActive = (item) => {
    if (item.end) {
      return location.pathname === item.href;
    }

    return location.pathname.startsWith(item.href);
  };

  const getInitials = () => {
    const name = clientName || user?.name || 'Client';

    return name
      .split(' ')
      .filter(Boolean)
      .map((word) => word[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  const MobileBrand = () => (
    <div className="flex items-center gap-2 min-w-0">
      {brandLogo ? (
        <img
          src={brandLogo}
          alt={brandName}
          className="h-9 max-w-[160px] object-contain"
          data-testid="mobile-client-app-logo-img"
        />
      ) : (
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-[#0F172A] dark:text-[#FAFAFA] truncate">
            {brandName}
          </h1>
          <p className="text-[9px] uppercase tracking-wider text-[#0EA5E9] dark:text-[#A5B4FC] font-semibold">
            Client Portal
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#09090B]">

      {/* Desktop Sidebar */}
      <motion.aside
        initial={false}
        animate={{
          width: sidebarOpen ? 256 : 64,
        }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="fixed left-0 top-0 h-full bg-white dark:bg-[#18181B] border-r border-[#E2E8F0] dark:border-[#27272A] z-40 hidden lg:block"
        data-testid="client-sidebar"
      >
        <div className="h-full flex flex-col">

          {/* Logo */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-[#E2E8F0] dark:border-[#27272A]">
            <SidebarBrand sidebarOpen={sidebarOpen} brandLogo={brandLogo} brandName={brandName} />

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-[#64748B] hover:text-[#0F172A] dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA] flex-shrink-0"
              data-testid="client-sidebar-toggle"
            >
              <Menu className="w-5 h-5" />
            </Button>
          </div>

          {/* Navigation */}
          <nav
            className="flex-1 overflow-y-auto p-3 space-y-1"
            data-testid="client-nav"
          >
            {sidebarOpen && (
              <div
                className="mb-2 px-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#94A3B8] dark:text-[#71717A]"
                data-testid="client-portal-label"
              >
                <Shield className="w-3.5 h-3.5" />
                Client Portal
              </div>
            )}

            {navItems.map((item) => (
              <NavigationItem
                key={item.name}
                item={item}
                sidebarOpen={sidebarOpen}
                setMobileMenuOpen={setMobileMenuOpen}
              />
            ))}
          </nav>

          {/* User Profile */}
          <div className="p-3 border-t border-[#E2E8F0] dark:border-[#27272A]">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#F1F5F9] dark:hover:bg-[#27272A] transition-colors"
                  data-testid="client-user-menu-trigger"
                >
                  <Avatar className="w-8 h-8 flex-shrink-0">
                    <AvatarImage
                      src={user?.avatar_path}
                      alt={clientName || user?.name || 'Client'}
                    />
                    <AvatarFallback className="bg-[#0EA5E9] text-white text-sm">
                      {getInitials()}
                    </AvatarFallback>
                  </Avatar>

                  {sidebarOpen && (
                    <>
                      <div className="flex-1 text-left min-w-0">
                        <p
                          className="text-sm font-medium text-[#0F172A] dark:text-[#FAFAFA] truncate"
                          data-testid="client-name"
                        >
                          {clientName || user?.name || 'Client'}
                        </p>

                        <p className="text-xs text-[#64748B] dark:text-[#A1A1AA] truncate">
                          {user?.email || 'Client Account'}
                        </p>
                      </div>

                      <ChevronDown className="w-4 h-4 text-[#64748B] dark:text-[#A1A1AA] flex-shrink-0" />
                    </>
                  )}
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  My Account
                </DropdownMenuLabel>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={() => navigate('/client-portal/profile')}
                >
                  <User className="w-4 h-4 mr-2" />
                  Company Profile
                </DropdownMenuItem>

                <DropdownMenuItem onClick={toggleTheme}>
                  {theme === 'light' ? (
                    <Moon className="w-4 h-4 mr-2" />
                  ) : (
                    <Sun className="w-4 h-4 mr-2" />
                  )}

                  {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={handleLogout}
                  data-testid="client-logout-button"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </motion.aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white dark:bg-[#18181B] border-b border-[#E2E8F0] dark:border-[#27272A] z-30 flex items-center justify-between px-4">
        <MobileBrand />

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          data-testid="client-mobile-toggle"
        >
          {mobileMenuOpen ? (
            <X className="w-6 h-6" />
          ) : (
            <Menu className="w-6 h-6" />
          )}
        </Button>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="lg:hidden fixed inset-y-0 left-0 w-64 bg-white dark:bg-[#18181B] border-r border-[#E2E8F0] dark:border-[#27272A] z-40 pt-16 flex flex-col"
          >
            <nav
              className="p-3 space-y-1 flex-1 overflow-y-auto"
              data-testid="client-mobile-nav"
            >
              <div className="mb-2 px-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#94A3B8] dark:text-[#71717A]">
                <Shield className="w-3.5 h-3.5" />
                Client Portal
              </div>

              {navItems.map((item) => (
                <NavigationItem
                  key={item.name}
                  item={item}
                  mobile
                  sidebarOpen={sidebarOpen}
                  setMobileMenuOpen={setMobileMenuOpen}
                />
              ))}
            </nav>

            {/* Mobile User Footer */}
            <div
              className="p-3 border-t border-[#E2E8F0] dark:border-[#27272A] space-y-1"
              data-testid="client-mobile-user-footer"
            >
              <div className="flex items-center gap-3 px-3 py-2">
                <Avatar className="w-9 h-9 flex-shrink-0">
                  <AvatarImage
                    src={user?.avatar_path}
                    alt={clientName || user?.name || 'Client'}
                  />

                  <AvatarFallback className="bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] text-xs font-semibold">
                    {getInitials()}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {clientName || user?.name || 'Client'}
                  </div>

                  <div className="text-xs text-[#64748B] dark:text-[#A1A1AA] truncate">
                    {user?.email || 'Client Account'}
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  navigate('/client-portal/profile');
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[#334155] dark:text-[#E4E4E7] hover:bg-[#F1F5F9] dark:hover:bg-[#27272A]"
                data-testid="client-mobile-profile-btn"
              >
                <User className="w-4 h-4" />
                Company Profile
              </button>

              <button
                onClick={() => toggleTheme()}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[#334155] dark:text-[#E4E4E7] hover:bg-[#F1F5F9] dark:hover:bg-[#27272A]"
                data-testid="client-mobile-theme-btn"
              >
                {theme === 'light' ? (
                  <Moon className="w-4 h-4" />
                ) : (
                  <Sun className="w-4 h-4" />
                )}

                {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
              </button>

              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleLogout();
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold text-[var(--danger)] hover:bg-rose-50 dark:hover:bg-rose-950/30"
                data-testid="client-mobile-logout"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main
        className="transition-all duration-300 lg:ml-[--sidebar-width]"
        style={{
          '--sidebar-width': sidebarOpen ? '256px' : '64px',
        }}
      >
        <div className="pt-16 lg:pt-0 min-w-0">

          {/* Top Bar */}
          <div className="h-16 bg-white/70 dark:bg-[#18181B]/70 backdrop-blur-xl border-b border-[#E2E8F0] dark:border-[#27272A] px-3 md:px-6 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0 max-w-2xl">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B] dark:text-[#A1A1AA]" />

                <Input
                  placeholder="Search..."
                  className="pl-11 bg-[#F8FAFC] dark:bg-[#09090B] border-[#E2E8F0] dark:border-[#27272A]"
                  data-testid="client-global-search-input"
                />
              </div>
            </div>

            <div className="flex items-center gap-1 md:gap-3 shrink-0">
              <TimezoneMenu />
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                data-testid="client-theme-toggle-button"
              >
                {theme === 'light' ? (
                  <Moon className="w-5 h-5" />
                ) : (
                  <Sun className="w-5 h-5" />
                )}
              </Button>

              <NotificationBell />
            </div>
          </div>

          {/* Page Content */}
          <div className="p-3 md:p-6">
            <ScopeProvider base="/portal/dispatch">
              <Outlet />
            </ScopeProvider>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ClientPortalLayout;
