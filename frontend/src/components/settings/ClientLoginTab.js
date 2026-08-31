import { useEffect, useState } from 'react';
import { api, formatApiErrorDetail } from '@/lib/axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/sonner';
import { Monitor, Save, RotateCcw } from 'lucide-react';
import { useAppSettings } from '@/contexts/AppSettingsContext';

const DEFAULTS = {
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

const ClientLoginTab = () => {
  const { settings, refresh } = useAppSettings();
  const [form, setForm] = useState(DEFAULTS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({ ...DEFAULTS, ...settings });
    }
  }, [settings]);

  const update = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);

    try {
      const payload = { ...DEFAULTS };

      Object.keys(DEFAULTS).forEach((key) => {
        payload[key] = form[key];
      });

      await api.put('/settings', payload);
      await refresh();

      toast.success('Client login page settings saved.');
    } catch (e) {
      toast.error(
        formatApiErrorDetail(
          e.response?.data?.detail || 'Failed to save client login settings'
        )
      );
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setForm((prev) => ({
      ...prev,
      ...DEFAULTS,
    }));
  };

  if (!settings) {
    return <div className="p-6 text-sm text-[#64748B]">Loading…</div>;
  }

  return (
    <Card
      className="border-[#E2E8F0] dark:border-[#27272A]"
      data-testid="client-login-settings-card"
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Monitor className="w-5 h-5" />
          Client Portal Login Page
        </CardTitle>
        <p className="text-sm text-[#64748B] dark:text-[#A1A1AA]">
          Customize the login page clients see at the Client Portal.
        </p>
      </CardHeader>

      <CardContent className="space-y-8">

        {/* Main login content */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[#0F172A] dark:text-[#FAFAFA]">
            Login Content
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Badge Text</Label>
              <Input
                value={form.client_login_badge}
                onChange={(e) => update('client_login_badge', e.target.value)}
                placeholder="Client Portal"
              />
            </div>

            <div className="space-y-2">
              <Label>Login Title</Label>
              <Input
                value={form.client_login_title}
                onChange={(e) => update('client_login_title', e.target.value)}
                placeholder="Client Sign In"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Login Subtitle</Label>
            <Textarea
              value={form.client_login_subtitle}
              onChange={(e) => update('client_login_subtitle', e.target.value)}
              rows={2}
              placeholder="Sign in to view your schedules..."
            />
          </div>
        </section>

        {/* Form labels */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[#0F172A] dark:text-[#FAFAFA]">
            Form Labels
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Email Label</Label>
              <Input
                value={form.client_login_email_label}
                onChange={(e) => update('client_login_email_label', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Password Label</Label>
              <Input
                value={form.client_login_password_label}
                onChange={(e) => update('client_login_password_label', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Button Text</Label>
              <Input
                value={form.client_login_button_text}
                onChange={(e) => update('client_login_button_text', e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* Hero panel */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[#0F172A] dark:text-[#FAFAFA]">
            Right-Side Hero Panel
          </h3>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Hero Title</Label>
              <Input
                value={form.client_login_hero_title}
                onChange={(e) => update('client_login_hero_title', e.target.value)}
                placeholder="Client Portal"
              />
            </div>

            <div className="space-y-2">
              <Label>Hero Description</Label>
              <Textarea
                value={form.client_login_hero_subtitle}
                onChange={(e) => update('client_login_hero_subtitle', e.target.value)}
                rows={4}
              />
            </div>
          </div>
        </section>

        {/* Footer links */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[#0F172A] dark:text-[#FAFAFA]">
            Footer / Access Messages
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Employee/Admin Text</Label>
              <Input
                value={form.client_login_employee_text}
                onChange={(e) => update('client_login_employee_text', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Main Login Link Text</Label>
              <Input
                value={form.client_login_employee_link_text}
                onChange={(e) => update('client_login_employee_link_text', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Client Access Message</Label>
            <Textarea
              value={form.client_login_contact_text}
              onChange={(e) => update('client_login_contact_text', e.target.value)}
              rows={2}
            />
          </div>
        </section>

        {/* Colours */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[#0F172A] dark:text-[#FAFAFA]">
            Client Login Colours
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              ['client_login_primary_color', 'Button Colour'],
              ['client_login_primary_hover_color', 'Button Hover'],
              ['client_login_hero_start_color', 'Hero Start'],
              ['client_login_hero_end_color', 'Hero End'],
            ].map(([key, label]) => (
              <div key={key} className="space-y-2">
                <Label>{label}</Label>

                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form[key]}
                    onChange={(e) => update(key, e.target.value)}
                    className="w-11 h-10 p-1 rounded-md border border-[#E2E8F0] dark:border-[#27272A] bg-transparent cursor-pointer"
                  />

                  <Input
                    value={form[key]}
                    onChange={(e) => update(key, e.target.value)}
                    placeholder="#0EA5E9"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Preview */}
        <section className="rounded-xl overflow-hidden border border-[#E2E8F0] dark:border-[#27272A]">
          <div
            className="p-6 text-white"
            style={{
              background: `linear-gradient(135deg, ${form.client_login_hero_start_color}, ${form.client_login_hero_end_color})`,
            }}
          >
            <div className="text-xs uppercase tracking-wider opacity-80 mb-2">
              Live Preview
            </div>

            <h3 className="text-2xl font-bold mb-2">
              {form.client_login_hero_title || 'Client Portal'}
            </h3>

            <p className="text-sm opacity-90 max-w-2xl">
              {form.client_login_hero_subtitle}
            </p>
          </div>
        </section>

        {/* Actions */}
        <div className="flex flex-wrap gap-3 pt-2">
          <Button
            onClick={save}
            disabled={saving}
            className="bg-[#0EA5E9] hover:bg-[#0284C7]"
            data-testid="save-client-login-settings"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving…' : 'Save Client Login'}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={reset}
            disabled={saving}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset Form
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ClientLoginTab;
