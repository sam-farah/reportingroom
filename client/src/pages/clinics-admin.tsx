import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertClinicSchema } from "@shared/schema";
import { Building2, Plus, Loader2, Copy, Check, Mail, Users, MapPin } from "lucide-react";

type ClinicRow = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  state: string | null;
  isActive: boolean;
  createdAt: string | null;
  staffCount: number;
  owners: { name: string; email: string }[];
  pendingOwnerInvites: string[];
};

const formSchema = insertClinicSchema.extend({
  ownerEmail: z.string().email("Enter a valid email for the clinic owner"),
});
type FormData = z.infer<typeof formSchema>;

export default function ClinicsAdmin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ clinicName: string; ownerEmail: string; invitationUrl: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: clinics = [], isLoading } = useQuery<ClinicRow[]>({
    queryKey: ["/api/admin/clinics"],
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      address: "",
      city: "",
      state: "",
      zipCode: "",
      ownerEmail: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await apiRequest("/api/admin/clinics", "POST", data);
      return await res.json();
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clinics"] });
      setInviteResult({
        clinicName: res.clinic?.name ?? "",
        ownerEmail: res.ownerEmail ?? "",
        invitationUrl: res.invitationUrl ?? "",
      });
      setDialogOpen(false);
      form.reset();
      toast({ title: "Clinic created", description: "An invitation has been emailed to the new owner." });
    },
    onError: (error: Error) => {
      toast({ title: "Could not create clinic", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: FormData) => createMutation.mutate(data);

  const copyLink = async () => {
    if (!inviteResult) return;
    try {
      await navigator.clipboard.writeText(inviteResult.invitationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Select and copy the link manually.", variant: "destructive" });
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto w-full" style={{ paddingTop: "32px" }}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center shadow-md flex-shrink-0">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Clinics</h2>
            <p className="text-sm text-gray-500">Create new clinics and invite their owners.</p>
          </div>
        </div>
        <Button onClick={() => setDialogOpen(true)} data-testid="button-add-clinic">
          <Plus className="w-4 h-4 mr-2" />Add Clinic
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />Loading clinics…
        </div>
      ) : clinics.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center text-gray-500">
            <Building2 className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p>No clinics yet. Click “Add Clinic” to create the first one.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {clinics.map((c) => (
            <Card key={c.id} data-testid={`card-clinic-${c.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    {c.name}
                    {!c.isActive && <Badge variant="outline" className="text-amber-600 border-amber-300">Inactive</Badge>}
                  </CardTitle>
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Users className="w-3 h-3" />{c.staffCount}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-gray-600 space-y-1.5 pt-0">
                <div className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-gray-400" />{c.email}</div>
                {(c.city || c.state) && (
                  <div className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-gray-400" />{[c.city, c.state].filter(Boolean).join(", ")}</div>
                )}
                <div className="pt-1">
                  <span className="text-xs font-medium text-gray-500">Owner: </span>
                  {c.owners.length > 0 ? (
                    c.owners.map((o) => <span key={o.email} className="text-gray-800">{o.name} ({o.email}) </span>)
                  ) : c.pendingOwnerInvites.length > 0 ? (
                    <Badge variant="outline" className="text-amber-600 border-amber-300">Invite pending: {c.pendingOwnerInvites.join(", ")}</Badge>
                  ) : (
                    <span className="text-gray-400">none</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Clinic dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add a new clinic</DialogTitle>
            <DialogDescription>
              Enter the clinic details and the email of the person who will own it. They'll receive an invitation link to set up their account.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Clinic name *</FormLabel>
                  <FormControl><Input {...field} value={field.value ?? ""} placeholder="e.g. Bayside Vascular" data-testid="input-clinic-name" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Clinic email *</FormLabel>
                  <FormControl><Input type="email" {...field} value={field.value ?? ""} placeholder="clinic@example.com" data-testid="input-clinic-email" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} data-testid="input-clinic-phone" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="zipCode" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Postcode</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} data-testid="input-clinic-zip" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="address" render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl><Input {...field} value={field.value ?? ""} data-testid="input-clinic-address" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="city" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Suburb / City</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} data-testid="input-clinic-city" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="state" render={({ field }) => (
                  <FormItem>
                    <FormLabel>State</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} placeholder="e.g. VIC" data-testid="input-clinic-state" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="border-t pt-3 mt-1">
                <FormField control={form.control} name="ownerEmail" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Clinic owner's email *</FormLabel>
                    <FormControl><Input type="email" {...field} value={field.value ?? ""} placeholder="owner@example.com" data-testid="input-owner-email" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-clinic">
                  {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Create Clinic & Invite Owner
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Invite link result */}
      <Dialog open={!!inviteResult} onOpenChange={(o) => !o && setInviteResult(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="w-5 h-5 text-green-600" />Clinic created
            </DialogTitle>
            <DialogDescription>
              {inviteResult?.clinicName} is set up. We've emailed an invitation to {inviteResult?.ownerEmail}. You can also share the link below directly.
            </DialogDescription>
          </DialogHeader>
          {inviteResult?.invitationUrl ? (
            <>
              <div className="bg-gray-50 border rounded-lg p-3 flex items-center gap-2">
                <code className="text-xs text-gray-700 break-all flex-1" data-testid="text-invite-link">{inviteResult?.invitationUrl}</code>
                <Button size="sm" variant="outline" onClick={copyLink} className="flex-shrink-0">
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-gray-500">The owner opens this link, creates their account (or signs in), and they'll become the clinic owner. The link is valid for 14 days.</p>
            </>
          ) : (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              The clinic was created, but we couldn't generate the invite link to display here. Please refresh the list and re-send the owner invitation.
            </p>
          )}
          <div className="flex justify-end">
            <Button onClick={() => setInviteResult(null)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
