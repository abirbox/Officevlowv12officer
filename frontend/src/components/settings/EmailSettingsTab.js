import { useEffect, useState } from 'react';
import { api, formatApiErrorDetail } from '@/lib/axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { Mail, Save, ShieldCheck, Send, Code2 } from 'lucide-react';

const EmailSettingsTab = () => {
  const [form, setForm] = useState({ smtp_host: '', smtp_port: 587, username: '', password: '', from_email: '' });
  const [hasPassword, setHasPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Templates
  const [templates, setTemplates] = useState({});
  const [shortcodes, setShortcodes] = useState([]);
  const [tplKey, setTplKey] = useState('geofence_exit');
  const [tpl, setTpl] = useState({ from_name: '', subject: '', body_html: '' });
  const [savingTpl, setSavingTpl] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [transport, setTransport] = useState('none');
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/settings/email')
      .then(({ data }) => {
        setForm({ smtp_host: data.smtp_host || '', smtp_port: data.smtp_port || 587, username: data.username || '', password: '', from_email: data.from_email || '' });
        setHasPassword(!!data.has_password);
      })
      .catch((e) => toast.error(formatApiErrorDetail(e.response?.data?.detail)))
      .finally(() => setLoading(false));
    api.get('/settings/email-templates')
      .then(({ data }) => {
        setTemplates(data.templates || {});
        setShortcodes(data.shortcodes || []);
        setEmailConfigured(!!data.email_configured);
        setTransport(data.transport || 'none');
        const first = Object.keys(data.templates || {})[0] || 'geofence_exit';
        setTplKey(first);
        setTpl(data.templates?.[first] || { from_name: '', subject: '', body_html: '' });
      })
      .catch(() => {});
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (templates[tplKey]) setTpl(templates[tplKey]); }, [tplKey]); // eslint-disable-line

  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.smtp_host || !form.username || !form.from_email) { toast.error('SMTP Host, Username and From Email are required'); return; }
    if (!hasPassword && !form.password) { toast.error('Password is required for the first save'); return; }
    setSaving(true);
    try {
      const { data } = await api.put('/settings/email', {
        smtp_host: form.smtp_host, smtp_port: Number(form.smtp_port) || 587,
        username: form.username, from_email: form.from_email, password: form.password || undefined,
      });
      setHasPassword(!!data.has_password);
      setForm((p) => ({ ...p, password: '' }));
      setEmailConfigured(true); setTransport('smtp');
      toast.success('Email settings saved');
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const saveTpl = async () => {
    setSavingTpl(true);
    try {
      const { data } = await api.put('/settings/email-templates', { key: tplKey, ...tpl });
      setTemplates((p) => ({ ...p, [tplKey]: data }));
      toast.success('Template saved');
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { setSavingTpl(false); }
  };

  const sendTest = async () => {
    if (!testTo || !testTo.includes('@')) { toast.error('Enter a valid recipient email'); return; }
    setTesting(true);
    try {
      const { data } = await api.post('/settings/email/test', { to: testTo, template_key: tplKey });
      if (data.sent) toast.success(data.message);
      else toast.warning(data.message || 'Email not sent');
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { setTesting(false); }
  };

  const insertShortcode = (code) => setTpl((p) => ({ ...p, body_html: `${p.body_html || ''}{{${code}}}` }));

  return (
    <div className="space-y-6">
      <Card className="border-[#E2E8F0] dark:border-[#27272A]" data-testid="email-settings-tab">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mail className="w-5 h-5 text-[#0EA5E9]" /> Email Settings (SMTP)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start gap-2 text-sm text-[#64748B] dark:text-[#A1A1AA] bg-[#F8FAFC] dark:bg-[#0F0F11] border border-[#E2E8F0] dark:border-[#27272A] rounded-lg p-3">
            <ShieldCheck className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
            <span>These SMTP credentials send password-reset and alert emails. The password is stored encrypted and never shown again.
              {' '}Status: <b data-testid="email-status">{emailConfigured ? `Configured (${transport})` : 'Not configured'}</b>.</span>
          </div>
          {loading ? <div className="text-[#64748B]">Loading…</div> : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2 sm:col-span-2"><Label>SMTP Host</Label><Input value={form.smtp_host} onChange={(e) => setF('smtp_host', e.target.value)} placeholder="smtp.gmail.com" data-testid="smtp-host-input" /></div>
                <div className="space-y-2"><Label>SMTP Port</Label><Input type="number" value={form.smtp_port} onChange={(e) => setF('smtp_port', e.target.value)} placeholder="587" data-testid="smtp-port-input" /></div>
                <div className="space-y-2"><Label>From Email</Label><Input type="email" value={form.from_email} onChange={(e) => setF('from_email', e.target.value)} placeholder="no-reply@company.com" data-testid="smtp-from-input" /></div>
                <div className="space-y-2"><Label>Username</Label><Input value={form.username} onChange={(e) => setF('username', e.target.value)} placeholder="mailer@company.com" autoComplete="off" data-testid="smtp-username-input" /></div>
                <div className="space-y-2"><Label>Password {hasPassword && <span className="text-xs text-[#94A3B8]">(leave blank to keep current)</span>}</Label><Input type="password" value={form.password} onChange={(e) => setF('password', e.target.value)} placeholder={hasPassword ? '••••••••' : 'SMTP password'} autoComplete="new-password" data-testid="smtp-password-input" /></div>
              </div>
              <Button onClick={save} disabled={saving} className="bg-[#0EA5E9] hover:bg-[#0284C7]" data-testid="save-email-settings-button">
                <Save className="w-4 h-4 mr-2" /> {saving ? 'Saving…' : 'Save Email Settings'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Test email */}
      <Card className="border-[#E2E8F0] dark:border-[#27272A]" data-testid="email-test-card">
        <CardHeader><CardTitle className="flex items-center gap-2"><Send className="w-5 h-5 text-[#0EA5E9]" /> Send a Test Email</CardTitle></CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1 space-y-2"><Label>Recipient</Label><Input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@company.com" data-testid="test-email-to" /></div>
          <Button onClick={sendTest} disabled={testing} className="bg-[#0EA5E9] hover:bg-[#0284C7]" data-testid="send-test-email-button">
            <Send className="w-4 h-4 mr-2" /> {testing ? 'Sending…' : `Send Test (${templates[tplKey]?.label || tplKey})`}
          </Button>
        </CardContent>
      </Card>

      {/* Templates */}
      <Card className="border-[#E2E8F0] dark:border-[#27272A]" data-testid="email-templates-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Code2 className="w-5 h-5 text-[#0EA5E9]" /> Email Templates</CardTitle>
          <p className="text-sm text-[#64748B] dark:text-[#A1A1AA]">Edit the From name, subject and content for each alert email. Use shortcodes to insert live values.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 max-w-sm">
            <Label>Template</Label>
            <Select value={tplKey} onValueChange={setTplKey}>
              <SelectTrigger data-testid="template-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(templates).map(([k, v]) => (
                  <SelectItem key={k} value={k} data-testid={`template-option-${k}`}>{v.label || k}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>From Name</Label><Input value={tpl.from_name || ''} onChange={(e) => setTpl((p) => ({ ...p, from_name: e.target.value }))} placeholder="OfficeFlow Alerts" data-testid="template-from-name" /></div>
            <div className="space-y-2"><Label>Subject</Label><Input value={tpl.subject || ''} onChange={(e) => setTpl((p) => ({ ...p, subject: e.target.value }))} data-testid="template-subject" /></div>
          </div>
          <div className="space-y-2">
            <Label>Body (HTML)</Label>
            <Textarea rows={7} value={tpl.body_html || ''} onChange={(e) => setTpl((p) => ({ ...p, body_html: e.target.value }))} className="font-mono text-sm" data-testid="template-body" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-[#94A3B8]">Shortcodes (click to insert into body)</Label>
            <div className="flex flex-wrap gap-1.5" data-testid="shortcode-list">
              {shortcodes.map((c) => (
                <button key={c} type="button" onClick={() => insertShortcode(c)}
                  className="px-2 py-1 rounded-md text-xs font-mono bg-[#F1F5F9] dark:bg-[#27272A] text-[#0EA5E9] hover:bg-[#E2E8F0] dark:hover:bg-[#3F3F46]"
                  data-testid={`shortcode-${c}`}>{`{{${c}}}`}</button>
              ))}
            </div>
          </div>
          <Button onClick={saveTpl} disabled={savingTpl} className="bg-[#0EA5E9] hover:bg-[#0284C7]" data-testid="save-template-button">
            <Save className="w-4 h-4 mr-2" /> {savingTpl ? 'Saving…' : 'Save Template'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmailSettingsTab;
