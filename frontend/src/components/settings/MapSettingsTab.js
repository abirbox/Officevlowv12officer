import { useEffect, useState } from 'react';
import { api, formatApiErrorDetail } from '@/lib/axios';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { Map as MapIcon } from 'lucide-react';

const MapSettingsTab = () => {
  const { refresh } = useAppSettings();
  const [provider, setProvider] = useState('osm');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/settings')
      .then(({ data }) => {
        setProvider(data.map_provider || 'osm');
        setApiKey(data.google_maps_api_key || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (provider === 'google' && !apiKey.trim()) {
      toast.error('Enter a Google Maps API key to use Google Maps.');
      return;
    }
    setSaving(true);
    try {
      await api.put('/settings', {
        map_provider: provider,
        google_maps_api_key: apiKey.trim() || null,
      });
      await refresh();
      toast.success('Map settings saved');
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-[#E2E8F0] dark:border-[#27272A]" data-testid="map-settings-tab">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapIcon className="w-5 h-5" /> Map Settings
        </CardTitle>
        <p className="text-sm text-[#64748B] dark:text-[#A1A1AA]">
          Choose the map provider used across the app — the Post Site map and Live Tracking map.
        </p>
      </CardHeader>
      <CardContent className="space-y-6 max-w-lg">
        <div className="space-y-2">
          <Label>Map Provider</Label>
          <Select value={provider} onValueChange={setProvider} disabled={loading}>
            <SelectTrigger data-testid="map-provider-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="osm" data-testid="map-provider-osm">OpenStreetMap</SelectItem>
              <SelectItem value="google" data-testid="map-provider-google">Google Maps</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-[#94A3B8]">
            OpenStreetMap is free and needs no key. Google Maps requires a valid API key.
          </p>
        </div>

        {provider === 'google' && (
          <div className="space-y-2" data-testid="google-key-field">
            <Label>Google Maps API Key</Label>
            <Input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIza…"
              className="font-mono"
              data-testid="google-maps-api-key-input"
            />
            <p className="text-xs text-[#94A3B8]">
              Stored in system settings. Maps switch to Google once a key is saved.
            </p>
          </div>
        )}

        <Button onClick={save} disabled={saving || loading}
          className="bg-[#0EA5E9] hover:bg-[#0284C7]" data-testid="save-map-settings">
          {saving ? 'Saving…' : 'Save Map Settings'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default MapSettingsTab;
