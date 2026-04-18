import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Edit, Trash2, Phone, Mail, Stethoscope, Building2, ArrowUpDown } from "lucide-react";
import type { ReferringDoctor } from "@shared/schema";
import { DeliveryBadge } from "@/components/delivery-badge";

type FormData = {
  name: string;
  practiceName: string;
  providerNumber: string;
  phone: string;
  fax: string;
  email: string;
  address: string;
  notes: string;
  preferredReportDelivery: string;
  preferredReportDeliveryNote: string;
};

const blank = (): FormData => ({
  name: "", practiceName: "", providerNumber: "",
  phone: "", fax: "", email: "", address: "", notes: "",
  preferredReportDelivery: "", preferredReportDeliveryNote: "",
});

type SortKey = "name" | "practice" | "provider" | "delivery";

export default function Contacts() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [deliveryFilter, setDeliveryFilter] = useState<string>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<ReferringDoctor | null>(null);
  const [form, setForm] = useState<FormData>(blank());
  const f = (k: keyof FormData, v: string) => setForm(p => ({ ...p, [k]: v }));

  const { data: doctors = [], isLoading } = useQuery<ReferringDoctor[]>({
    queryKey: ["/api/referring-doctors"],
  });

  const createMutation = useMutation({
    mutationFn: (data: FormData) => apiRequest("/api/referring-doctors", "POST", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/referring-doctors"] }); close(); toast({ title: "Contact saved" }); },
    onError: () => toast({ title: "Failed to save contact", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<FormData> }) => apiRequest(`/api/referring-doctors/${id}`, "PUT", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/referring-doctors"] }); close(); toast({ title: "Contact updated" }); },
    onError: () => toast({ title: "Failed to update contact", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/referring-doctors/${id}`, "DELETE"),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/referring-doctors"] }); toast({ title: "Contact deleted" }); },
    onError: () => toast({ title: "Failed to delete contact", variant: "destructive" }),
  });

  const openNew = () => { setEditing(null); setForm(blank()); setIsOpen(true); };
  const openEdit = (d: ReferringDoctor) => {
    setEditing(d);
    setForm({
      name: d.name,
      practiceName: d.practiceName ?? "",
      providerNumber: d.providerNumber ?? "",
      phone: d.phone ?? "",
      fax: d.fax ?? "",
      email: d.email ?? "",
      address: d.address ?? "",
      notes: d.notes ?? "",
      preferredReportDelivery: (d as any).preferredReportDelivery ?? "",
      preferredReportDeliveryNote: (d as any).preferredReportDeliveryNote ?? "",
    });
    setIsOpen(true);
  };
  const close = () => { setIsOpen(false); setEditing(null); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (editing) updateMutation.mutate({ id: editing.id, data: form });
    else createMutation.mutate(form);
  };

  const toggleSort = (key: SortKey) => {
    setSort(prev => prev.key === key
      ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
      : { key, dir: "asc" });
  };

  const filtered = (() => {
    const q = search.trim().toLowerCase();
    const list = doctors.filter(d => {
      const matchSearch = !q ||
        d.name.toLowerCase().includes(q) ||
        (d.practiceName ?? "").toLowerCase().includes(q) ||
        (d.providerNumber ?? "").toLowerCase().includes(q) ||
        (d.email ?? "").toLowerCase().includes(q) ||
        (d.phone ?? "").includes(search);
      const matchDelivery = deliveryFilter === "all" ||
        (deliveryFilter === "none" ? !((d as any).preferredReportDelivery) : (d as any).preferredReportDelivery === deliveryFilter);
      return matchSearch && matchDelivery;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    const get = (d: ReferringDoctor): string => {
      switch (sort.key) {
        case "practice": return (d.practiceName ?? "").toLowerCase();
        case "provider": return (d.providerNumber ?? "").toLowerCase();
        case "delivery": return ((d as any).preferredReportDelivery ?? "zzz").toLowerCase();
        default: return d.name.toLowerCase();
      }
    };
    return [...list].sort((a, b) => {
      const av = get(a), bv = get(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  })();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Contacts</h1>
          <p className="text-gray-500 mt-1 text-sm">Referring doctors and GP directory</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="w-4 h-4 mr-2" /> Add Contact
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            className="pl-9"
            placeholder="Search by name, practice, provider, phone, email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={deliveryFilter} onValueChange={setDeliveryFilter}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All delivery preferences</SelectItem>
            <SelectItem value="secure_messaging">Secure Messaging</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="fax">Fax</SelectItem>
            <SelectItem value="post">Post</SelectItem>
            <SelectItem value="other">Other</SelectItem>
            <SelectItem value="none">No preference set</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Stethoscope className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500">
            {doctors.length === 0 ? "No contacts saved yet" : "No contacts match your filters"}
          </p>
          {doctors.length === 0 && (
            <Button variant="outline" className="mt-4" onClick={openNew}>
              <Plus className="w-4 h-4 mr-2" /> Add first contact
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="text-xs text-gray-500 mb-2">
            Showing <span className="font-semibold text-gray-700">{filtered.length}</span> of {doctors.length} contacts
          </div>
          <div className="border rounded-lg overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">
                      <button className="inline-flex items-center gap-1 hover:text-gray-900" onClick={() => toggleSort("name")}>
                        Doctor <ArrowUpDown className="w-3 h-3 opacity-50" />
                      </button>
                    </th>
                    <th className="text-left px-3 py-2 font-semibold hidden md:table-cell">
                      <button className="inline-flex items-center gap-1 hover:text-gray-900" onClick={() => toggleSort("practice")}>
                        Practice <ArrowUpDown className="w-3 h-3 opacity-50" />
                      </button>
                    </th>
                    <th className="text-left px-3 py-2 font-semibold hidden lg:table-cell">
                      <button className="inline-flex items-center gap-1 hover:text-gray-900" onClick={() => toggleSort("provider")}>
                        Provider # <ArrowUpDown className="w-3 h-3 opacity-50" />
                      </button>
                    </th>
                    <th className="text-left px-3 py-2 font-semibold hidden lg:table-cell">Contact</th>
                    <th className="text-left px-3 py-2 font-semibold">
                      <button className="inline-flex items-center gap-1 hover:text-gray-900" onClick={() => toggleSort("delivery")}>
                        Report Delivery <ArrowUpDown className="w-3 h-3 opacity-50" />
                      </button>
                    </th>
                    <th className="text-right px-3 py-2 font-semibold w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(d => {
                    const delivery = (d as any).preferredReportDelivery as string | null | undefined;
                    const deliveryNote = (d as any).preferredReportDeliveryNote as string | null | undefined;
                    return (
                      <tr key={d.id} className="hover:bg-blue-50/50 cursor-pointer" onClick={() => openEdit(d)}>
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-900">{d.name}</div>
                          {d.practiceName && <div className="text-xs text-gray-500 md:hidden flex items-center gap-1"><Building2 className="w-3 h-3" />{d.practiceName}</div>}
                        </td>
                        <td className="px-3 py-2 hidden md:table-cell text-gray-700">
                          {d.practiceName || <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 hidden lg:table-cell font-mono text-xs text-gray-600">
                          {d.providerNumber || <span className="text-gray-300 font-sans">—</span>}
                        </td>
                        <td className="px-3 py-2 hidden lg:table-cell text-xs text-gray-600">
                          <div className="flex flex-col gap-0.5">
                            {d.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{d.phone}</span>}
                            {d.email && <span className="flex items-center gap-1 truncate max-w-[180px]"><Mail className="w-3 h-3" />{d.email}</span>}
                            {!d.phone && !d.email && <span className="text-gray-300">—</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {delivery ? (
                            <DeliveryBadge method={delivery} note={deliveryNote} />
                          ) : (
                            <span className="text-xs text-gray-400 italic">No preference</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right" onClick={e => e.stopPropagation()}>
                          <div className="inline-flex gap-0.5">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(d)}><Edit className="w-3.5 h-3.5" /></Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-700" onClick={() => { if (confirm(`Delete ${d.name}?`)) deleteMutation.mutate(d.id); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={isOpen} onOpenChange={v => { if (!v) close(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Contact" : "Add Contact"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Full Name *</Label>
              <Input value={form.name} onChange={e => f("name", e.target.value)} required placeholder="Dr. John Smith" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Practice / Organisation</Label>
                <Input value={form.practiceName} onChange={e => f("practiceName", e.target.value)} placeholder="City Medical Centre" className="mt-1" />
              </div>
              <div>
                <Label>Provider Number</Label>
                <Input value={form.providerNumber} onChange={e => f("providerNumber", e.target.value)} placeholder="2029764K" className="mt-1" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={form.phone} onChange={e => f("phone", e.target.value)} placeholder="02 9999 0000" className="mt-1" />
              </div>
              <div>
                <Label>Fax</Label>
                <Input value={form.fax} onChange={e => f("fax", e.target.value)} placeholder="02 9999 0001" className="mt-1" />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={e => f("email", e.target.value)} className="mt-1" />
              </div>
              <div className="col-span-2">
                <Label>Address</Label>
                <Input value={form.address} onChange={e => f("address", e.target.value)} placeholder="123 Main St, Sydney NSW 2000" className="mt-1" />
              </div>
              <div className="col-span-2">
                <Label>Preferred Report Delivery</Label>
                <Select
                  value={form.preferredReportDelivery || "__none"}
                  onValueChange={v => setForm(p => ({ ...p, preferredReportDelivery: v === "__none" ? "" : v, preferredReportDeliveryNote: v === "other" ? p.preferredReportDeliveryNote : "" }))}
                >
                  <SelectTrigger className="mt-1"><SelectValue placeholder="No preference" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">No preference</SelectItem>
                    <SelectItem value="secure_messaging">Secure Messaging</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="fax">Fax</SelectItem>
                    <SelectItem value="post">Post</SelectItem>
                    <SelectItem value="other">Other (specify)</SelectItem>
                  </SelectContent>
                </Select>
                {form.preferredReportDelivery === "other" && (
                  <Input
                    className="mt-2"
                    placeholder="Specify delivery method..."
                    value={form.preferredReportDeliveryNote}
                    onChange={e => f("preferredReportDeliveryNote", e.target.value)}
                  />
                )}
                <p className="text-[11px] text-gray-500 mt-1">
                  How this doctor prefers to receive completed reports.
                </p>
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={e => f("notes", e.target.value)} rows={2} className="mt-1" />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t">
              <Button type="button" variant="outline" onClick={close}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {createMutation.isPending || updateMutation.isPending ? "Saving…" : editing ? "Update" : "Add Contact"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
