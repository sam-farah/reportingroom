import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, XCircle, Loader2, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface InvitationDetails {
  id: number;
  email: string;
  role: string;
  clinicId: number;
  isActive: boolean;
  expiresAt: string;
  clinic?: {
    name: string;
    address?: string;
  };
}

export default function InvitationPage() {
  const { token } = useParams();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token && !authLoading) {
      fetchInvitationDetails();
    }
  }, [token, authLoading]);

  const fetchInvitationDetails = async () => {
    try {
      const response = await fetch(`/api/invitations/${token}/details`);
      if (response.ok) {
        const data = await response.json();
        setInvitation(data);
      } else {
        const errorData = await response.json();
        setError(errorData.message || "Invalid or expired invitation");
      }
    } catch (err) {
      setError("Failed to load invitation details");
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvitation = async () => {
    if (!isAuthenticated || !token) return;

    setAccepting(true);
    try {
      const response = await apiRequest(`/api/invitations/${token}/accept`, "POST");
      if (response.ok) {
        setAccepted(true);
        toast({
          title: "Welcome!",
          description: `You've successfully joined ${invitation?.clinic?.name || 'the clinic'}`,
        });
        
        // Redirect to dashboard after a short delay
        setTimeout(() => {
          window.location.href = "/";
        }, 2000);
      } else {
        const errorData = await response.json();
        toast({
          title: "Failed to Accept Invitation",
          description: errorData.message || "Please try again",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to accept invitation. Please try again.",
        variant: "destructive",
      });
    } finally {
      setAccepting(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading invitation...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <UserPlus className="w-12 h-12 mx-auto mb-4 text-blue-600" />
            <CardTitle>Login Required</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-gray-600">
              You need to be logged in to accept this clinic invitation.
            </p>
            <Button 
              className="w-full" 
              onClick={() => window.location.href = "/api/login"}
            >
              Login to Continue
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <XCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
            <CardTitle>Invalid Invitation</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-gray-600">{error}</p>
            <Button 
              variant="outline" 
              onClick={() => window.location.href = "/"}
            >
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
            <CardTitle>Welcome to the Team!</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-gray-600">
              You've successfully joined {invitation?.clinic?.name || 'the clinic'}.
              Redirecting to your dashboard...
            </p>
            <div className="animate-pulse">
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full animate-pulse"></div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <UserPlus className="w-12 h-12 mx-auto mb-4 text-blue-600" />
          <CardTitle>Clinic Invitation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {invitation && (
            <div className="text-center space-y-3">
              <p className="text-gray-600">
                You've been invited to join
              </p>
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h3 className="font-semibold text-blue-900">
                  {invitation.clinic?.name || 'Medical Clinic'}
                </h3>
                {invitation.clinic?.address && (
                  <p className="text-sm text-blue-700 mt-1">
                    {invitation.clinic.address}
                  </p>
                )}
              </div>
              <div className="bg-gray-50 p-3 rounded border">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Role:</span> {invitation.role}
                </p>
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Email:</span> {invitation.email}
                </p>
              </div>
              <p className="text-xs text-gray-500">
                Invitation expires: {new Date(invitation.expiresAt).toLocaleDateString()}
              </p>
            </div>
          )}
          
          <div className="flex space-x-3">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={() => window.location.href = "/"}
            >
              Cancel
            </Button>
            <Button 
              className="flex-1 bg-blue-600 hover:bg-blue-700" 
              onClick={handleAcceptInvitation}
              disabled={accepting}
            >
              {accepting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Accepting...
                </>
              ) : (
                "Accept Invitation"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}