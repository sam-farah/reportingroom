import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Plus, Mail, Clock, CheckCircle, XCircle, Trash2, Users, Copy, Link2, Check } from "lucide-react";
import { z } from "zod";

function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    return success;
  } catch {
    document.body.removeChild(textarea);
    return false;
  }
}

const inviteSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  role: z.enum(["admin", "sonographer"], {
    required_error: "Please select a role",
  }),
});

type InviteFormData = z.infer<typeof inviteSchema>;

interface Invitation {
  id: number;
  email: string;
  role: string;
  token: string;
  invitedBy: string;
  createdAt: string;
  acceptedAt?: string;
  isActive: boolean;
}

interface StaffMember {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  joinedAt?: string;
  isActive: boolean;
}

export default function StaffManagement() {
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const form = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: "",
      role: "sonographer",
    },
  });

  // Fetch pending invitations
  const { data: invitations = [], isLoading: invitationsLoading } = useQuery<Invitation[]>({
    queryKey: ["/api/invitations"],
    enabled: !!user,
  });

  // Fetch current staff members
  const { data: staffMembers = [], isLoading: staffLoading } = useQuery<StaffMember[]>({
    queryKey: ["/api/staff"],
    enabled: !!user,
  });

  const inviteMutation = useMutation({
    mutationFn: async (data: InviteFormData) => {
      const res = await apiRequest("/api/invitations", "POST", data);
      return res;
    },
    onSuccess: (data: any) => {
      const token = data?.token;
      if (token) {
        const link = `${window.location.origin}/invite/${token}`;
        setLastInviteLink(link);
      }
      toast({
        title: "Invitation Created",
        description: "Share the invitation link with your team member.",
      });
      form.reset();
      setIsInviteDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/invitations"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Send Invitation",
        description: error.message || "Failed to send invitation. Please try again.",
        variant: "destructive",
      });
    },
  });

  const cancelInvitationMutation = useMutation({
    mutationFn: async (invitationId: number) => {
      return await apiRequest(`/api/invitations/${invitationId}`, "DELETE");
    },
    onSuccess: () => {
      toast({
        title: "Invitation Cancelled",
        description: "The invitation has been cancelled successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/invitations"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Cancel Invitation",
        description: error.message || "Failed to cancel invitation. Please try again.",
        variant: "destructive",
      });
    },
  });

  const [confirmRemoveMember, setConfirmRemoveMember] = useState<StaffMember | null>(null);

  const deactivateStaffMutation = useMutation({
    mutationFn: async (staffId: string) => {
      return await apiRequest(`/api/staff/${staffId}/deactivate`, "PATCH");
    },
    onSuccess: () => {
      toast({
        title: "Team Member Removed",
        description: "The team member has been removed from your clinic.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      setConfirmRemoveMember(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Remove Team Member",
        description: error.message || "Failed to remove team member. Please try again.",
        variant: "destructive",
      });
      setConfirmRemoveMember(null);
    },
  });

  const onSubmit = (data: InviteFormData) => {
    inviteMutation.mutate(data);
  };

  if (!user) {
    return <div>Please log in to manage staff.</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Staff Management</h1>
            <p className="text-gray-600">Manage your clinic's staff members and invitations</p>
          </div>
          <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
            <DialogTrigger asChild>
              <Button className="medical-btn-primary">
                <Plus className="h-4 w-4 mr-2" />
                Invite Staff
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite New Staff Member</DialogTitle>
                <DialogDescription>
                  Send an invitation to a new team member to join your clinic.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <Input placeholder="staff@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Role</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a role" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="sonographer">Sonographer</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex justify-end space-x-2 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsInviteDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={inviteMutation.isPending}>
                      {inviteMutation.isPending ? "Sending..." : "Send Invitation"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {lastInviteLink && (
        <Card className="mb-6 border-green-200 bg-green-50">
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Link2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-green-800">Invitation link created! Share it with your team member:</p>
                  <input 
                    readOnly 
                    value={lastInviteLink} 
                    className="text-xs text-green-700 font-mono mt-1 w-full bg-transparent border-none outline-none cursor-text select-all p-0"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-green-300 text-green-700 hover:bg-green-100"
                  onClick={async () => {
                    const success = await copyToClipboard(lastInviteLink);
                    if (success) {
                      toast({ title: "Copied!", description: "Invitation link copied to clipboard." });
                    } else {
                      toast({ title: "Copy failed", description: "Please select and copy the link manually.", variant: "destructive" });
                    }
                  }}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  Copy
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setLastInviteLink(null)}
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Users className="h-5 w-5 mr-2" />
              Current Staff ({staffMembers.length})
            </CardTitle>
            <CardDescription>
              Active staff members in your clinic
            </CardDescription>
          </CardHeader>
          <CardContent>
            {staffLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-16 bg-gray-200 rounded-lg"></div>
                  </div>
                ))}
              </div>
            ) : staffMembers.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No staff members yet</p>
                <p className="text-sm">Invite your first team member to get started</p>
              </div>
            ) : (
              <div className="space-y-3">
                {staffMembers.map((member: StaffMember) => (
                  <div key={member.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium">
                        {member.firstName && member.lastName 
                          ? `${member.firstName} ${member.lastName}`
                          : member.email
                        }
                      </div>
                      <div className="text-sm text-gray-500">{member.email}</div>
                      <div className="flex items-center space-x-2 mt-1">
                        <Badge variant="secondary" className="text-xs">
                          {member.role}
                        </Badge>
                        {member.joinedAt && (
                          <span className="text-xs text-gray-400">
                            Joined {new Date(member.joinedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmRemoveMember(member)}
                      disabled={member.id === user.id}
                      className="text-red-600 hover:text-red-800"
                      title="Remove from team"
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending Invitations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Mail className="h-5 w-5 mr-2" />
              Pending Invitations ({invitations.length})
            </CardTitle>
            <CardDescription>
              Invitations waiting for acceptance
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invitationsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-16 bg-gray-200 rounded-lg"></div>
                  </div>
                ))}
              </div>
            ) : invitations.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No pending invitations</p>
                <p className="text-sm">All invitations have been accepted or expired</p>
              </div>
            ) : (
              <div className="space-y-3">
                {invitations.map((invitation: Invitation) => (
                  <div key={invitation.id} className="p-3 border rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-medium">{invitation.email}</div>
                        <div className="flex items-center space-x-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {invitation.role}
                          </Badge>
                          <div className="flex items-center text-xs text-gray-400">
                            <Clock className="h-3 w-3 mr-1" />
                            Sent {new Date(invitation.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => cancelInvitationMutation.mutate(invitation.id)}
                        disabled={cancelInvitationMutation.isPending}
                        className="text-red-600 hover:text-red-800"
                        title="Cancel invitation"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={`${window.location.origin}/invite/${invitation.token}`}
                        className="flex-1 text-xs font-mono bg-gray-50 border rounded px-2 py-1.5 text-gray-600 cursor-text"
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const link = `${window.location.origin}/invite/${invitation.token}`;
                          const success = await copyToClipboard(link);
                          if (success) {
                            toast({ title: "Copied!", description: "Invitation link copied to clipboard." });
                          } else {
                            toast({ title: "Copy failed", description: "Please copy this link manually.", variant: "destructive" });
                          }
                        }}
                        className="text-blue-600 border-blue-200 hover:bg-blue-50 flex-shrink-0"
                      >
                        <Copy className="h-3.5 w-3.5 mr-1" />
                        Copy Link
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Confirm Remove Dialog */}
      <Dialog open={!!confirmRemoveMember} onOpenChange={(open) => { if (!open) setConfirmRemoveMember(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Team Member</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove{" "}
              <strong>
                {confirmRemoveMember?.firstName && confirmRemoveMember?.lastName
                  ? `${confirmRemoveMember.firstName} ${confirmRemoveMember.lastName}`
                  : confirmRemoveMember?.email}
              </strong>{" "}
              from the clinic? They will lose access immediately and can only rejoin via a new invitation.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmRemoveMember(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmRemoveMember && deactivateStaffMutation.mutate(confirmRemoveMember.id)}
              disabled={deactivateStaffMutation.isPending}
            >
              {deactivateStaffMutation.isPending ? "Removing…" : "Remove"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}