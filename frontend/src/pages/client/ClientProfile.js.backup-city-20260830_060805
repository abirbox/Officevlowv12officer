import { useEffect, useRef, useState } from 'react';
import { api, formatApiErrorDetail } from '@/lib/axios';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { Building2, Upload, Loader2 } from 'lucide-react';

const ClientProfile = () => {
  const { refresh: refreshSettings } = useAppSettings() || {};
  const fileRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    name: '', address: '', contact_number: '', email: '', logo_path: '', logo_url: '',
  });

  const load = () => {
    setLoading(true);
    api.get('/portal/me')
      .then(({ data }) => {
        const c = data.client || {};
        setForm({
          name: c.name || '',
          address: c.address || '',
          contact_number: c.contact_number || '',
          email: c.email || '',
          logo_path: c.logo_path || '',
          logo_url: c.logo_url || '',
        });
      })
      .catch(() => toast.error('Could not load your profile'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const onPickLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image file'); return; }
    const fd = new FormData();
    fd.append('file', file);
    setUploading(true);
    try {
      const { data } = await api.post('/portal/dispatch/upload-logo', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      set('logo_path', data.url);
      set('logo_url', data.url);
      toast.success('Logo uploaded — remember to Save');
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || 'Logo upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error('Company name is required'); return; }
    setSaving(true);
    try {
      const { data } = await api.put('/portal/profile', {
        name: form.name.trim(),
        address: form.address,
        contact_number: form.contact_number,
        email: form.email,
        logo_path: form.logo_path || null,
      });
      const c = data.client || {};
      setForm((p) => ({ ...p, logo_url: c.logo_url || '', logo_path: c.logo_path || '' }));
      toast.success('Profile updated');
      if (refreshSettings) refreshSettings();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || 'Could not save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6" data-testid="client-profile-page">
      <div>
        <h1 className="text-3xl font-bold text-[#0F172A] dark:text-[#FAFAFA]">Company Profile</h1>
        <p className="text-[#64748B] dark:text-[#A1A1AA] mt-1">Update your company name, logo and contact details.</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[#64748B] py-10"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : (
        <div className="bg-white dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A] rounded-xl p-6 space-y-6">
          {/* Logo */}
          <div className="flex items-center gap-5">
            <div className="w-24 h-24 rounded-xl border border-[#E2E8F0] dark:border-[#27272A] bg-[#F8FAFC] dark:bg-[#0F0F11] flex items-center justify-center overflow-hidden shrink-0">
              {form.logo_url ? (
                <img src={form.logo_url} alt="Company logo" className="w-full h-full object-contain" data-testid="profile-logo-img" />
              ) : (
                <Building2 className="w-8 h-8 text-[#94A3B8]" />
              )}
            </div>
            <div>
              <Label className="text-sm">Company Logo</Label>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickLogo} data-testid="profile-logo-input" />
              <div className="mt-2">
                <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()} data-testid="profile-logo-upload">
                  {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                  {uploading ? 'Uploading…' : 'Upload Logo'}
                </Button>
              </div>
              <p className="text-xs text-[#94A3B8] mt-1">PNG or JPG, square works best.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 space-y-1.5">
              <Label>Company Name *</Label>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Your company name" data-testid="profile-name" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone Number</Label>
              <Input value={form.contact_number} onChange={(e) => set('contact_number', e.target.value)} placeholder="+1 555 000 1234" data-testid="profile-phone" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="billing@company.com" data-testid="profile-email" />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Street, City, State, ZIP" data-testid="profile-address" />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#E2E8F0] dark:border-[#27272A]">
            <Button variant="outline" onClick={load} disabled={saving}>Reset</Button>
            <Button onClick={save} disabled={saving} className="bg-[#4F46E5] hover:bg-[#4338CA]" data-testid="profile-save">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientProfile;
