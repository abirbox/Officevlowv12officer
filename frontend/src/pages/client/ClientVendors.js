import { useEffect, useState } from 'react';
import { api, formatApiErrorDetail } from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/sonner';
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Building2,
  MapPin,
  Eye,
} from 'lucide-react';
import { STATUS_BADGE } from '@/pages/dashboard/dispatch/_shared';

const emptyForm = {
  name: '',
  contact_person: '',
  contact_number: '',
  website: '',
  email: '',
  address: '',
  location: '',
  city: '',
  status: 'active',
  notes: '',
};

const ClientVendors = () => {
  const [rows, setRows] = useState([]);
  const [postSites, setPostSites] = useState([]);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [postSiteFilter, setPostSiteFilter] = useState('all');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const [sitesDialogOpen, setSitesDialogOpen] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [selectedVendorSites, setSelectedVendorSites] = useState([]);
  const [loadingSites, setLoadingSites] = useState(false);

  const loadVendors = async () => {
    setLoading(true);

    try {
      const params = {};

      if (search.trim()) params.search = search.trim();
      if (status !== 'all') params.status = status;

      const { data } = await api.get('/portal/vendors', { params });

      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const loadPostSites = async () => {
    try {
      const { data } = await api.get('/portal/dispatch/post-sites', {
        params: {
          limit: 500,
        },
      });

      setPostSites(Array.isArray(data) ? data : []);
    } catch (e) {
      setPostSites([]);
    }
  };

  useEffect(() => {
    loadVendors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status]);

  useEffect(() => {
    loadPostSites();
  }, []);

  const getVendorSites = (vendorId) => {
    return postSites.filter(
      (site) => String(site.vendor_id || '') === String(vendorId)
    );
  };

  const filteredRows = rows.filter((vendor) => {
    if (postSiteFilter === 'all') return true;

    return getVendorSites(vendor.id).some(
      (site) => String(site.id) === String(postSiteFilter)
    );
  });

  const setF = (key, value) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (vendor) => {
    setEditing(vendor);

    setForm({
      name: vendor.name || '',
      contact_person: vendor.contact_person || '',
      contact_number: vendor.contact_number || '',
      website: vendor.website || '',
      email: vendor.email || '',
      address: vendor.address || '',
      location: vendor.location || '',
      city: vendor.city || '',
      status: vendor.status || 'active',
      notes: vendor.notes || '',
    });

    setDialogOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error('Vendor name is required');
      return;
    }

    setSaving(true);

    try {
      if (editing) {
        await api.put(`/portal/vendors/${editing.id}`, form);
        toast.success('Vendor updated');
      } else {
        await api.post('/portal/vendors', form);
        toast.success('Vendor created');
      }

      setDialogOpen(false);

      await Promise.all([
        loadVendors(),
        loadPostSites(),
      ]);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  const removeVendor = async (vendor) => {
    const sites = getVendorSites(vendor.id);

    if (sites.length > 0) {
      toast.error(
        `Cannot delete this vendor. It is assigned to ${sites.length} post site(s).`
      );
      return;
    }

    if (
      !window.confirm(
        `Permanently delete "${vendor.name}"?\n\nThis cannot be undone.`
      )
    ) {
      return;
    }

    try {
      await api.delete(`/portal/vendors/${vendor.id}`);
      toast.success('Vendor deleted');

      await loadVendors();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const openSites = async (vendor) => {
    setSelectedVendor(vendor);
    setSelectedVendorSites([]);
    setSitesDialogOpen(true);
    setLoadingSites(true);

    try {
      const { data } = await api.get(
        `/portal/vendors/${vendor.id}/post-sites`
      );

      setSelectedVendorSites(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
      setSelectedVendorSites([]);
    } finally {
      setLoadingSites(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="client-vendors">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-[#0F172A] dark:text-[#FAFAFA]">
            My Vendors
          </h1>

          <p className="text-[#64748B] dark:text-[#A1A1AA] mt-1">
            Manage vendors that serve your account.
          </p>
        </div>

        <Button
          onClick={openCreate}
          className="bg-[#0EA5E9] hover:bg-[#0284C7]"
          data-testid="client-vendor-create"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Vendor
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">

        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />

          <Input
            placeholder="Search by vendor name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="client-vendor-search"
          />
        </div>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger
            className="w-[170px]"
            data-testid="client-vendor-status-filter"
          >
            <SelectValue placeholder="Status" />
          </SelectTrigger>

          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={postSiteFilter}
          onValueChange={setPostSiteFilter}
        >
          <SelectTrigger
            className="w-[220px]"
            data-testid="client-vendor-post-site-filter"
          >
            <SelectValue placeholder="Post Site" />
          </SelectTrigger>

          <SelectContent>
            <SelectItem value="all">
              All Post Sites
            </SelectItem>

            {postSites.map((site) => (
              <SelectItem key={site.id} value={site.id}>
                {site.post_pin} — {site.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(search || status !== 'all' || postSiteFilter !== 'all') && (
          <Button
            variant="outline"
            onClick={() => {
              setSearch('');
              setStatus('all');
              setPostSiteFilter('all');
            }}
          >
            Clear Filters
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A] rounded-xl overflow-x-auto">

        <table className="w-full text-sm">

          <thead className="bg-[#F8FAFC] dark:bg-[#0F0F11] text-left text-xs uppercase tracking-wider text-[#64748B]">
            <tr>
              <th className="px-4 py-3">Vendor</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">Post Sites</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#27272A]">

            {loading ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-[#64748B]"
                >
                  Loading...
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-[#64748B]"
                >
                  No vendors found
                </td>
              </tr>
            ) : (
              filteredRows.map((vendor) => {
                const sites = getVendorSites(vendor.id);

                return (
                  <tr
                    key={vendor.id}
                    data-testid={`client-vendor-row-${vendor.id}`}
                  >

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">

                        {vendor.logo_url || vendor.logo_path ? (
                          <img
                            src={vendor.logo_url || vendor.logo_path}
                            alt={vendor.name}
                            className="w-10 h-10 rounded-lg object-contain border border-[#E2E8F0] dark:border-[#27272A] bg-white"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-[#F1F5F9] dark:bg-[#27272A] flex items-center justify-center">
                            <Building2 className="w-5 h-5 text-[#64748B]" />
                          </div>
                        )}

                        <div>
                          <div className="font-medium text-[#0F172A] dark:text-[#FAFAFA]">
                            {vendor.name}
                          </div>

                          {vendor.code && (
                            <div className="text-xs text-[#64748B]">
                              {vendor.code}
                            </div>
                          )}
                        </div>

                      </div>
                    </td>

                    <td className="px-4 py-3 text-[#334155] dark:text-[#E4E4E7]">
                      {vendor.contact_person || '—'}
                    </td>

                    <td className="px-4 py-3 text-[#334155] dark:text-[#E4E4E7]">
                      {vendor.contact_number || '—'}
                    </td>

                    <td className="px-4 py-3 text-[#334155] dark:text-[#E4E4E7]">
                      {vendor.city || '—'}
                    </td>

                    <td className="px-4 py-3">
                      {sites.length > 0 ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openSites(vendor)}
                          className="gap-1"
                          data-testid={`vendor-sites-${vendor.id}`}
                        >
                          <MapPin className="w-3 h-3" />
                          {sites.length}
                        </Button>
                      ) : (
                        <span className="text-[#94A3B8]">
                          0
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          STATUS_BADGE[vendor.status] ||
                          STATUS_BADGE.inactive
                        }`}
                      >
                        {vendor.status || 'inactive'}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right whitespace-nowrap">

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openSites(vendor)}
                        className="mr-2"
                        title="View post sites"
                      >
                        <Eye className="w-3 h-3" />
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(vendor)}
                        className="mr-2"
                        data-testid={`client-vendor-edit-${vendor.id}`}
                        title="Edit vendor"
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => removeVendor(vendor)}
                        className="text-red-600"
                        data-testid={`client-vendor-delete-${vendor.id}`}
                        title="Delete vendor"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>

                    </td>

                  </tr>
                );
              })
            )}

          </tbody>
        </table>
      </div>

      {/* Add/Edit Vendor */}
      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      >
        <DialogContent
          className="max-w-2xl max-h-[85vh] overflow-y-auto"
          data-testid="client-vendor-form"
        >

          <DialogHeader>
            <DialogTitle>
              {editing ? 'Edit Vendor' : 'Add Vendor'}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            <div className="space-y-1 sm:col-span-2">
              <Label>Vendor Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setF('name', e.target.value)}
                placeholder="Vendor name"
                data-testid="vendor-name"
              />
            </div>

            <div className="space-y-1">
              <Label>Contact Person</Label>
              <Input
                value={form.contact_person}
                onChange={(e) =>
                  setF('contact_person', e.target.value)
                }
              />
            </div>

            <div className="space-y-1">
              <Label>Contact Number</Label>
              <Input
                value={form.contact_number}
                onChange={(e) =>
                  setF('contact_number', e.target.value)
                }
              />
            </div>

            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setF('email', e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Website</Label>
              <Input
                value={form.website}
                onChange={(e) => setF('website', e.target.value)}
                placeholder="https://"
              />
            </div>

            <div className="space-y-1">
              <Label>City</Label>
              <Input
                value={form.city}
                onChange={(e) => setF('city', e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Location</Label>
              <Input
                value={form.location}
                onChange={(e) => setF('location', e.target.value)}
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label>Address</Label>
              <Textarea
                value={form.address}
                onChange={(e) => setF('address', e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Status</Label>

              <Select
                value={form.status}
                onValueChange={(v) => setF('status', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label>Notes</Label>

              <Textarea
                value={form.notes}
                onChange={(e) => setF('notes', e.target.value)}
                placeholder="Optional notes"
              />
            </div>

          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>

            <Button
              onClick={submit}
              disabled={saving}
              className="bg-[#0EA5E9] hover:bg-[#0284C7]"
              data-testid="client-vendor-save"
            >
              {saving ? 'Saving…' : 'Save Vendor'}
            </Button>
          </DialogFooter>

        </DialogContent>
      </Dialog>

      {/* Assigned Post Sites */}
      <Dialog
        open={sitesDialogOpen}
        onOpenChange={setSitesDialogOpen}
      >
        <DialogContent
          className="max-w-2xl max-h-[85vh] overflow-y-auto"
          data-testid="vendor-post-sites-dialog"
        >

          <DialogHeader>
            <DialogTitle>
              {selectedVendor?.name || 'Vendor'} — Assigned Post Sites
            </DialogTitle>
          </DialogHeader>

          {loadingSites ? (
            <div className="py-8 text-center text-[#64748B]">
              Loading post sites...
            </div>
          ) : selectedVendorSites.length === 0 ? (
            <div className="py-8 text-center text-[#64748B]">
              No post sites are assigned to this vendor.
            </div>
          ) : (
            <div className="border border-[#E2E8F0] dark:border-[#27272A] rounded-lg overflow-hidden">

              <table className="w-full text-sm">

                <thead className="bg-[#F8FAFC] dark:bg-[#0F0F11]">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      Post Pin
                    </th>
                    <th className="px-4 py-3 text-left">
                      Post Site
                    </th>
                    <th className="px-4 py-3 text-left">
                      Location
                    </th>
                    <th className="px-4 py-3 text-left">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left">
                      Status
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#27272A]">

                  {selectedVendorSites.map((site) => (
                    <tr key={site.id}>

                      <td className="px-4 py-3 font-medium">
                        {site.post_pin}
                      </td>

                      <td className="px-4 py-3">
                        {site.name}
                      </td>

                      <td className="px-4 py-3">
                        {site.location || site.city || '—'}
                      </td>

                      <td className="px-4 py-3">
                        {site.type || '—'}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            STATUS_BADGE[site.status] ||
                            STATUS_BADGE.inactive
                          }`}
                        >
                          {site.status || 'inactive'}
                        </span>
                      </td>

                    </tr>
                  ))}

                </tbody>

              </table>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSitesDialogOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>

        </DialogContent>
      </Dialog>

    </div>
  );
};

export default ClientVendors;
