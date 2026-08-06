import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Clinic, ClinicLocation } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { MapPin, Plus, Edit, Trash2 } from "lucide-react";

const emptyForm = { name: "", address: "", phone: "", locationSpecificPracticeNumber: "" };

export default function ClinicLocationsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: locations = [], isLoading } = useQuery<ClinicLocation[]>({
    queryKey: ["/api/clinic-locations"],
  });

  const { data: clinic } = useQuery<Clinic>({ queryKey: ["/api/clinic"] });
  const mainName = clinic?.mainLocationName || "Main location";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [mainDialogOpen, setMainDialogOpen] = useState(false);
  const [mainNameForm, setMainNameForm] = useState("");
  const [mainLspnForm, setMainLspnForm] = useState("");

  const mainNameMutation = useMutation({
    mutationFn: async () => apiRequest("/api/clinic-locations/main", "PUT", {
      name: mainNameForm.trim() || null,
      locationSpecificPracticeNumber: mainLspnForm.trim() || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinic"] });
      toast({ title: "Main location updated" });
      setMainDialogOpen(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message || "Failed to rename main location", variant: "destructive" }),
  });
  const [editing, setEditing] = useState<ClinicLocation | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleting, setDeleting] = useState<ClinicLocation | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/clinic-locations"] });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        return apiRequest(`/api/clinic-locations/${editing.id}`, "PUT", form);
      }
      return apiRequest("/api/clinic-locations", "POST", form);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: editing ? "Location updated" : "Location added" });
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm);
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message || "Failed to save location", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest(`/api/clinic-locations/${id}`, "DELETE"),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      toast({ title: "Location removed", description: "Its appointments were moved to the main calendar." });
      setDeleting(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message || "Failed to delete location", variant: "destructive" }),
  });

  const openAdd = () => { setEditing(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (loc: ClinicLocation) => {
    setEditing(loc);
    setForm({
      name: loc.name,
      address: loc.address || "",
      phone: loc.phone || "",
      locationSpecificPracticeNumber: (loc as any).locationSpecificPracticeNumber || "",
    });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Locations</h2>
          <p className="text-gray-600 dark:text-gray-300">
            Add additional practice locations. Each location gets its own calendar — staff can switch between them on the Calendar screen.
          </p>
        </div>
        <Button onClick={openAdd} data-testid="button-add-location">
          <Plus className="w-4 h-4 mr-2" /> Add Location
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5" /> Practice Locations
          </CardTitle>
          <CardDescription>
            Your main clinic address is always the default calendar. Locations listed here appear as extra calendars.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between py-3 border-b" data-testid="row-location-main">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">
                {mainName} <span className="ml-2 text-xs font-normal text-gray-400 border rounded px-1.5 py-0.5">Default</span>
              </p>
              <p className="text-sm text-gray-500">
                {[clinic?.address, clinic?.phone].filter(Boolean).join(" · ") || "Uses your clinic's address from Clinic Settings"}
              </p>
              <p className="text-sm text-gray-500" data-testid="text-main-location-lspn">
                {(clinic as any)?.locationSpecificPracticeNumber
                  ? `LSPN ${(clinic as any).locationSpecificPracticeNumber}`
                  : "No LSPN set"}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setMainNameForm(clinic?.mainLocationName || "");
                setMainLspnForm((clinic as any)?.locationSpecificPracticeNumber || "");
                setMainDialogOpen(true);
              }}
              data-testid="button-edit-main-location"
            >
              <Edit className="w-4 h-4" />
            </Button>
          </div>
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : locations.length === 0 ? (
            <p className="text-sm text-gray-500 pt-3" data-testid="text-no-locations">
              No additional locations yet. Your clinic currently runs a single calendar.
            </p>
          ) : (
            <div className="divide-y">
              {locations.map((loc) => (
                <div key={loc.id} className="flex items-center justify-between py-3" data-testid={`row-location-${loc.id}`}>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{loc.name}</p>
                    <p className="text-sm text-gray-500">
                      {[loc.address, loc.phone].filter(Boolean).join(" · ") || "No address on file"}
                    </p>
                    <p className="text-sm text-gray-500" data-testid={`text-location-lspn-${loc.id}`}>
                      {(loc as any).locationSpecificPracticeNumber
                        ? `LSPN ${(loc as any).locationSpecificPracticeNumber}`
                        : "No LSPN set"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(loc)} data-testid={`button-edit-location-${loc.id}`}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setDeleting(loc)} data-testid={`button-delete-location-${loc.id}`}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditing(null); setForm(emptyForm); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Location" : "Add Location"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update this location's details." : "This location will appear as its own calendar on the Calendar screen."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="location-name">Location Name *</Label>
              <Input
                id="location-name"
                placeholder="e.g. Northside Rooms"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                data-testid="input-location-name"
              />
            </div>
            <div>
              <Label htmlFor="location-address">Address</Label>
              <Input
                id="location-address"
                placeholder="Street address"
                value={form.address}
                onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                data-testid="input-location-address"
              />
            </div>
            <div>
              <Label htmlFor="location-phone">Phone</Label>
              <Input
                id="location-phone"
                placeholder="Phone number"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                data-testid="input-location-phone"
              />
            </div>
            <div>
              <Label htmlFor="location-lspn">Location Specific Practice Number (LSPN)</Label>
              <Input
                id="location-lspn"
                placeholder="e.g. 123456AB"
                value={form.locationSpecificPracticeNumber}
                onChange={(e) => setForm((p) => ({ ...p, locationSpecificPracticeNumber: e.target.value }))}
                data-testid="input-location-lspn"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Medicare's number for this site. Assignment of Benefit forms use the number of the
                location the appointment was booked on. Left blank, the form prints nothing here
                rather than another site's number.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!form.name.trim() || saveMutation.isPending}
                data-testid="button-save-location"
              >
                {saveMutation.isPending ? "Saving…" : editing ? "Save Changes" : "Add Location"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={mainDialogOpen} onOpenChange={setMainDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Main Location</DialogTitle>
            <DialogDescription>
              This name appears in the location dropdowns on the Calendar, when scheduling requests, and in the referrer portal. Its address and phone come from your Clinic Settings. Leave the name blank to use "Main location".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="main-location-name">Display Name</Label>
              <Input
                id="main-location-name"
                placeholder="Main location"
                value={mainNameForm}
                onChange={(e) => setMainNameForm(e.target.value)}
                data-testid="input-main-location-name"
              />
            </div>
            <div>
              <Label htmlFor="main-location-lspn">Location Specific Practice Number (LSPN)</Label>
              <Input
                id="main-location-lspn"
                placeholder="e.g. 123456AB"
                value={mainLspnForm}
                onChange={(e) => setMainLspnForm(e.target.value)}
                data-testid="input-main-location-lspn"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Medicare's number for this site. Assignment of Benefit forms for appointments booked
                on this calendar use this number.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setMainDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => mainNameMutation.mutate()} disabled={mainNameMutation.isPending} data-testid="button-save-main-location">
                {mainNameMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Any appointments and blocked times booked at this location will be moved back to the main calendar. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete-location"
            >
              {deleteMutation.isPending ? "Removing…" : "Remove Location"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
