import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/axios';

const AppSettingsContext = createContext({
  settings: null,
  loading: true,
  refresh: () => {},
});

const DEFAULTS = {
  brand_name: 'OfficeFlow',
  brand_logo_url: null,
  favicon_url: null,
  site_title: null,
  company_address: null,
  support_email: null,
  contact_phone: null,
  footer_text: null,
  login_hero_title: 'OfficeFlow',
  login_hero_subtitle: 'Modern Office Management, HR, Attendance, GPS Tracking & Task Management Platform',
  login_welcome_title: 'Welcome Back',
  login_welcome_subtitle: 'Sign in to your OfficeFlow account',
  currency: 'BDT',
  currency_symbol: '৳',
  timezone: 'Asia/Dhaka',
  tz_offset_hours: 6.0,
  not_found_lottie_enabled: true,
  not_found_lottie_url: null,
  client_login_badge: 'Client Portal',
  client_login_title: 'Client Sign In',
  client_login_subtitle: 'Sign in to view your schedules, invoices and reports',
  client_login_hero_title: 'Client Portal',
  client_login_hero_subtitle: 'Live dispatch schedules, invoices, wage reports and post-site coverage — everything you need to keep your operation on track.',
  client_login_email_label: 'Client Email',
  client_login_password_label: 'Password',
  client_login_button_text: 'Sign In to Client Portal',
  client_login_employee_text: 'Employees and admins:',
  client_login_employee_link_text: 'use the main sign-in',
  client_login_contact_text: "Don't have client access? Contact your administrator.",
  client_login_primary_color: '#0EA5E9',
  client_login_primary_hover_color: '#0284C7',
  client_login_hero_start_color: '#0EA5E9',
  client_login_hero_end_color: '#0369A1',
};

const applyBranding = (s) => {
  if (!s) return;
  const title = s.site_title || s.brand_name || 'OfficeFlow';
  if (title) document.title = title;
  if (s.favicon_url) {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = s.favicon_url;
  }
};

export const AppSettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/settings/public');
      setSettings({ ...DEFAULTS, ...data });
      applyBranding({ ...DEFAULTS, ...data });
    } catch {
      setSettings(DEFAULTS);
      applyBranding(DEFAULTS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <AppSettingsContext.Provider value={{ settings, loading, refresh, setSettings }}>
      {children}
    </AppSettingsContext.Provider>
  );
};

export const useAppSettings = () => useContext(AppSettingsContext);

export const formatMoney = (amount, symbol = '৳') => {
  const n = Number(amount || 0);
  return `${symbol} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
