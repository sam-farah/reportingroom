import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl,FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, ArrowRight, CheckCircle2 } from "lucide-react";

const registerSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(8, "Password must be at least 8 characters"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const loginSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

interface InviteData {
  invitation: {
    email: string;
    token: string;
  };
  patientFirstName: string;
  clinicName: string;
}

export default function PatientPortalInvite() {
  const [, params] = useRoute("/patient-portal/invite/:token");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [mode, setMode] = useState<"register" | "login">("register");

  const { data: invite, isLoading, error } = useQuery<InviteData>({
    queryKey: ["/api/portal/invite", params?.token],
    enabled: !!params?.token,
  });

  const registerForm = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      password: "",
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (values: z.infer<typeof registerSchema>) => {
      const res = await apiRequest("/api/portal/register", "POST", {
        token: params?.token,
        password: values.password,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Account created",
        description: "Your patient portal account has been created successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/me"] });
      setLocation("/patient-portal");
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (values: z.infer<typeof loginSchema>) => {
      const res = await apiRequest("/api/portal/login", "POST", {
        email: invite?.invitation.email,
        password: values.password,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/me"] });
      setLocation("/patient-portal");
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-destructive text-center">Invalid Invitation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center text-slate-600">
              This invitation link is invalid or has expired. Please contact your clinic for a new invitation.
            </p>
          </CardContent>
          <CardFooter>
            <Button className="w-full" onClick={() => setLocation("/patient-portal/login")}>
              Go to Login
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="max-w-md w-full shadow-lg border-blue-100">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-blue-100 p-3 rounded-full">
              <CheckCircle2 className="w-8 h-8 text-blue-600" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-slate-900">
            Welcome, {invite.patientFirstName}
          </CardTitle>
          <CardDescription className="text-slate-500 text-lg">
            Access your medical records from {invite.clinicName}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 text-blue-800 text-sm">
            You are registering with: <strong>{invite.invitation.email}</strong>
          </div>

          {mode === "register" ? (
            <Form {...registerForm}>
              <form onSubmit={registerForm.handleSubmit((data) => registerMutation.mutate(data))} className="space-y-4">
                <FormField
                  control={registerForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Create Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} className="h-11" placeholder="••••••••" />
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
                        <Input type="password" {...field} className="h-11" placeholder="••••••••" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button 
                  type="submit" 
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-lg font-semibold" 
                  disabled={registerMutation.isPending}
                >
                  {registerMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Portal Account
                </Button>
              </form>
            </Form>
          ) : (
            <Form {...loginForm}>
              <form onSubmit={loginForm.handleSubmit((data) => loginMutation.mutate(data))} className="space-y-4">
                <FormField
                  control={loginForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} className="h-11" placeholder="••••••••" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button 
                  type="submit" 
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-lg font-semibold" 
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign In
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
        <CardFooter className="flex flex-col space-y-2">
          {mode === "register" ? (
            <Button variant="link" className="text-slate-500" onClick={() => setMode("login")}>
              Already have an account? Sign in
            </Button>
          ) : (
            <Button variant="link" className="text-slate-500" onClick={() => setMode("register")}>
              Back to registration
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
