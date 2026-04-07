import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Search, Edit, Trash2, Phone, Mail, MapPin, Hash, Building2, FileText, Stethoscope } from "lucide-react";
import type { ReferringDoctor } from "@shared/schema";

type FormData = {
  name: string;
  practiceName: string;
  providerNumber: string;
  phone: string;
  fax: string;
  email: string;
  address: string;
  notes: string;
};

const blank = (): FormData => ({
  name: "", practiceName: "", providerNumber: "",
  phone: "", fax: "", email: "", address: "", notes: "",
});

export default function Contacts() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
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
    setForm({ name: d.name, practiceName: d.practiceName ?? "", providerNumber: d.providerNumber ?? "", phone: d.phone ?? "", fax: d.fax ?? "", email: d.email ?? "", address: d.address ?? "", notes: d.notes ?? "" });
    setIsOpen(true);
  };
  const close = () => { setIsOpen(false); setEditing(null); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (editing) updateMutation.mutate({ id: editing.id, data: form });
    else createMutation.mutate(form);
  };

  const filtered = doctors.filter(d =>
    !search ||
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    (d.practiceName ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (d.providerNumber ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (d.phone ?? "").includes(search) ||
    (d.email ?? "").toLowerCase().includes(search.toLowerCase())
  );

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

      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          className="pl-9"
          placeholder="Search by name, practice, provider number, phone or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-gray-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Stethoscope className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">
            {search ? "No contacts match your search" : "No contacts saved yet"}
          </p>
          {!search && (
            <Button variant="outline" className="mt-4" onClick={openNew}>
              <Plus className="w-4 h-4 mr-2" /> Add first contact
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(d => (
            <Card key={d.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{d.name}</p>
                    {d.practiceName && (
                      <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                        <Building2 className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{d.practiceName}</span>
                      </p>
                    )}
                    {d.providerNumber && (
                      <p className="text-sm text-blue-600 flex items-center gap-1 mt-0.5">
                        <Hash className="w-3 h-3 flex-shrink-0" />
                        {d.providerNumber}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 ml-2 flex-shrink-0">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(d)}>
                      <Edit className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm" variant="ghost"
                      className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                      onClick={() => { if (confirm(`Delete ${d.name}?`)) deleteMutation.mutate(d.id); }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1 text-xs text-gray-500">
                  {d.phone && (
                    <p className="flex items-center gap-1.5">
                      <Phone className="w-3 h-3 flex-shrink-0" />
                      <a href={`tel:${d.phone}`} className="hover:text-gray-700">{d.phone}</a>
                    </p>
                  )}
                  {d.fax && (
                    <p className="flex items-center gap-1.5">
                      <FileText className="w-3 h-3 flex-shrink-0" />
                      Fax: {d.fax}
                    </p>
                  )}
                  {d.email && (
                    <p className="flex items-center gap-1.5">
                      <Mail className="w-3 h-3 flex-shrink-0" />
                      <a href={`mailto:${d.email}`} className="hover:text-gray-700 truncate">{d.email}</a>
                    </p>
                  )}
                  {d.address && (
                    <p className="flex items-start gap-1.5">
                      <MapPin className="w-3 h-3 flex-shrink-0 mt-0.5" />
                      <span>{d.address}</span>
                    </p>
                  )}
                  {d.notes && (
                    <p className="text-gray-400 italic mt-1 line-clamp-2">{d.notes}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
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
