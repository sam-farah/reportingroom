import { useState, useEffect } from "react";
import { useParams, useLocation, Link } from "wouter";
import { capitalizeWords } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, XCircle, Loader2, UserPlus, LogIn, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";

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

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phoneNumber: z.string().min(6, "A mobile number is required for sign-in codes"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

// apiRequest throws Error("<status>: <body>"); pull out a clean message.
function parseErrorMessage(error: Error): string {
  const raw = error?.message || "";
  const m = raw.match(/^\d{3}:\s*([\s\S]*)$/);
  if (!m) return raw;
  try {
    return JSON.parse(m[1]).message || m[1];
  } catch {
    return m[1];
  }
}

export default function InvitationPage() {
  const { token } = useParams();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loginForm = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const registerForm = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", confirmPassword: "", firstName: "", lastName: "", phoneNumber: "" },
  });

  // Two-step sign-in state for the "Sign In" tab (existing accounts need an SMS code).
  const [twoFactorStep, setTwoFactorStep] = useState(false);
  const [phoneHint, setPhoneHint] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");

  useEffect(() => {
    if (token) {
      fetchInvitationDetails();
    }
  }, [token]);

  useEffect(() => {
    if (invitation?.email) {
      loginForm.setValue("email", invitation.email);
      registerForm.setValue("email", invitation.email);
    }
  }, [invitation]);

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

  const loginMutation = useMutation({
    mutationFn: async (data: z.infer<typeof loginSchema>) => {
      const res = await apiRequest("/api/auth/login", "POST", data);
      return await res.json();
    },
    onSuccess: (res: any) => {
      if (res?.requiresTwoFactor) {
        setPhoneHint(res.phoneHint || "");
        setTwoFactorStep(true);
        setTwoFactorCode("");
        toast({ title: "Code sent", description: `We've texted a 6-digit code to ${res.phoneHint || "your mobile"}.` });
      }
    },
    onError: (error: Error) => {
      const msg = parseErrorMessage(error);
      toast({
        title: "Login Failed",
        description: msg || "Invalid email or password.",
        variant: "destructive",
      });
    },
  });

  const verify2faMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest("/api/auth/verify-2fa", "POST", { code });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      handleAcceptInvitation();
    },
    onError: (error: Error) => {
      toast({
        title: "Verification failed",
        description: parseErrorMessage(error) || "Incorrect code. Please try again.",
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: z.infer<typeof registerSchema>) => {
      const { confirmPassword, ...registerData } = data;
      return await apiRequest("/api/auth/register", "POST", registerData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      handleAcceptInvitation();
    },
    onError: (error: Error) => {
      toast({
        title: "Registration Failed",
        description: error.message || "Could not create account.",
        variant: "destructive",
      });
    },
  });

  const handleAcceptInvitation = async () => {
    if (!token) return;
    setAccepting(true);
    try {
      await apiRequest(`/api/invitations/${token}/accept`, "POST");
      setAccepted(true);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Welcome!",
        description: `You've successfully joined ${invitation?.clinic?.name || 'the clinic'}`,
      });
      setTimeout(() => {
        window.location.href = "/";
      }, 2000);
    } catch (err: any) {
      toast({
        title: "Failed to Accept Invitation",
        description: err.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setAccepting(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading invitation...</p>
        </div>
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
            <Button variant="outline" onClick={() => setLocation("/login")}>
              Go to Login
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

  if (isAuthenticated) {
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
                <p className="text-gray-600">You've been invited to join</p>
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <h3 className="font-semibold text-blue-900">
                    {invitation.clinic?.name || 'Medical Clinic'}
                  </h3>
                  {invitation.clinic?.address && (
                    <p className="text-sm text-blue-700 mt-1">{invitation.clinic.address}</p>
                  )}
                </div>
                <div className="bg-gray-50 p-3 rounded border">
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Role:</span> {invitation.role}
                  </p>
                </div>
              </div>
            )}
            <div className="flex space-x-3">
              <Button variant="outline" className="flex-1" onClick={() => setLocation("/")}>
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-teal-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <UserPlus className="w-12 h-12 mx-auto mb-4 text-blue-600" />
          <CardTitle>You're Invited!</CardTitle>
          {invitation && (
            <CardDescription>
              Join <span className="font-semibold">{invitation.clinic?.name || 'the clinic'}</span> as {invitation.role}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="register" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="register">Create Account</TabsTrigger>
              <TabsTrigger value="login">Sign In</TabsTrigger>
            </TabsList>

            <TabsContent value="register" className="space-y-4 mt-4">
              <Form {...registerForm}>
                <form onSubmit={registerForm.handleSubmit((data) => registerMutation.mutate(data))} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={registerForm.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
                          <FormControl>
                            <Input placeholder="John" {...field} autoCapitalize="words" onChange={(e) => field.onChange(capitalizeWords(e.target.value))} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Doe" {...field} autoCapitalize="words" onChange={(e) => field.onChange(capitalizeWords(e.target.value))} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={registerForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="email" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={registerForm.control}
                    name="phoneNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mobile Number</FormLabel>
                        <FormControl>
                          <Input type="tel" autoComplete="tel" placeholder="0412 345 678" {...field} />
                        </FormControl>
                        <p className="text-xs text-gray-500">We'll text you a 6-digit code each time you sign in.</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={registerForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="At least 6 characters" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={registerForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm Password</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="Re-enter password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                    {registerMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating Account...</>
                    ) : (
                      <><UserPlus className="w-4 h-4 mr-2" />Create Account & Join</>
                    )}
                  </Button>
                </form>
              </Form>
            </TabsContent>

            <TabsContent value="login" className="space-y-4 mt-4">
              {!twoFactorStep ? (
                <Form {...loginForm}>
                  <form onSubmit={loginForm.handleSubmit((data) => loginMutation.mutate(data))} className="space-y-3">
                    <FormField
                      control={loginForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="email" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={loginForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input type="password" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                      {loginMutation.isPending ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Signing in...</>
                      ) : (
                        <><LogIn className="w-4 h-4 mr-2" />Sign In & Join</>
                      )}
                    </Button>
                  </form>
                </Form>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                    <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>We've texted a 6-digit code{phoneHint ? ` to ${phoneHint}` : " to your mobile"}. Enter it below to finish signing in.</span>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Verification code</label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      placeholder="123456"
                      className="text-center text-2xl tracking-[0.5em] font-mono"
                      value={twoFactorCode}
                      onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    />
                  </div>
                  <Button
                    className="w-full"
                    disabled={verify2faMutation.isPending || twoFactorCode.length !== 6}
                    onClick={() => verify2faMutation.mutate(twoFactorCode)}
                  >
                    {verify2faMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Verifying...</>
                    ) : (
                      <><ShieldCheck className="w-4 h-4 mr-2" />Verify &amp; Join</>
                    )}
                  </Button>
                  <button
                    type="button"
                    className="text-sm text-gray-500 hover:text-gray-700"
                    onClick={() => { setTwoFactorStep(false); setTwoFactorCode(""); }}
                  >
                    Back
                  </button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
