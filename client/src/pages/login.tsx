import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, LogIn, ShieldCheck, ArrowLeft } from "lucide-react";

const loginSchema = z.object({
  email: z.string().min(1, "Username or email is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

const codeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

type CodeFormData = z.infer<typeof codeSchema>;

// apiRequest throws Error("<status>: <body>") where body is usually JSON.
// Pull out the status code, the optional error `code`, and a clean message.
function parseError(error: Error): { status: number | null; code?: string; message: string } {
  const raw = error?.message || "";
  const m = raw.match(/^(\d{3}):\s*([\s\S]*)$/);
  if (!m) return { status: null, message: raw };
  const status = parseInt(m[1], 10);
  let code: string | undefined;
  let message = m[2];
  try {
    const parsed = JSON.parse(m[2]);
    code = parsed.code;
    if (parsed.message) message = parsed.message;
  } catch {
    // body wasn't JSON — keep the raw text
  }
  return { status, code, message };
}

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // "password" = step 1, "code" = step 2 (SMS verification)
  const [step, setStep] = useState<"password" | "code">("password");
  const [phoneHint, setPhoneHint] = useState<string>("");
  const [noPhone, setNoPhone] = useState(false);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const codeForm = useForm<CodeFormData>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: "" },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      const res = await apiRequest("/api/auth/login", "POST", data);
      return await res.json();
    },
    onSuccess: (res: any) => {
      if (res?.requiresTwoFactor) {
        setPhoneHint(res.phoneHint || "");
        setStep("code");
        codeForm.reset({ code: "" });
        toast({
          title: "Code sent",
          description: `We've texted a 6-digit code to ${res.phoneHint || "your mobile"}.`,
        });
      }
    },
    onError: (error: Error) => {
      const { code, message } = parseError(error);
      if (code === "NO_PHONE" || /no mobile number/i.test(message)) {
        setNoPhone(true);
        return;
      }
      toast({
        title: "Login Failed",
        description: message || "Invalid email or password. Please try again.",
        variant: "destructive",
      });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (data: CodeFormData) => {
      const res = await apiRequest("/api/auth/verify-2fa", "POST", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setLocation("/");
    },
    onError: (error: Error) => {
      const { status, message } = parseError(error);
      if (status === 440) {
        toast({
          title: "Session expired",
          description: message || "Please sign in again.",
          variant: "destructive",
        });
        backToPassword();
        return;
      }
      toast({
        title: "Verification failed",
        description: message || "Incorrect code. Please try again.",
        variant: "destructive",
      });
    },
  });

  const resendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/auth/resend-2fa", "POST", {});
      return await res.json();
    },
    onSuccess: (res: any) => {
      if (res?.phoneHint) setPhoneHint(res.phoneHint);
      toast({ title: "Code resent", description: "A new code is on its way." });
    },
    onError: (error: Error) => {
      const { status, message } = parseError(error);
      if (status === 440) {
        backToPassword();
      }
      toast({
        title: "Could not resend",
        description: message || "Please try again shortly.",
        variant: "destructive",
      });
    },
  });

  const backToPassword = () => {
    setStep("password");
    setPhoneHint("");
    codeForm.reset({ code: "" });
  };

  const onSubmit = (data: LoginFormData) => {
    setNoPhone(false);
    loginMutation.mutate(data);
  };

  const onVerify = (data: CodeFormData) => {
    verifyMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-teal-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Reporting Room</CardTitle>
          <CardDescription>
            {step === "password" ? "Sign in to your account" : "Two-step verification"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "password" && (
            <>
              {typeof window !== "undefined" && new URLSearchParams(window.location.search).get("reason") === "idle" && (
                <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="banner-idle-logout">
                  You were signed out automatically after 20 minutes of inactivity. Please sign in again to continue.
                </div>
              )}
              {noPhone && (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900" data-testid="banner-no-phone">
                  No mobile number is on file for your account. Sign-in now requires a one-time code by text message. Please ask your clinic administrator to add your mobile number.
                </div>
              )}
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username or Email</FormLabel>
                        <FormControl>
                          <Input type="text" autoComplete="username" placeholder="Enter your username or email" {...field} data-testid="input-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input type="password" autoComplete="current-password" placeholder="Enter your password" {...field} data-testid="input-password" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={loginMutation.isPending} data-testid="button-signin">
                    {loginMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      <>
                        <LogIn className="w-4 h-4 mr-2" />
                        Sign In
                      </>
                    )}
                  </Button>
                </form>
              </Form>
              <div className="mt-6 text-center text-sm text-gray-500">
                Access is by invitation only. Contact your clinic administrator for access.
              </div>
            </>
          )}

          {step === "code" && (
            <>
              <div className="mb-4 flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>
                  For your security, we've texted a 6-digit code{phoneHint ? ` to ${phoneHint}` : " to your mobile"}. Enter it below to finish signing in. The code expires in 5 minutes.
                </span>
              </div>
              <Form {...codeForm}>
                <form onSubmit={codeForm.handleSubmit(onVerify)} className="space-y-4">
                  <FormField
                    control={codeForm.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Verification code</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            placeholder="123456"
                            className="text-center text-2xl tracking-[0.5em] font-mono"
                            {...field}
                            data-testid="input-code"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={verifyMutation.isPending} data-testid="button-verify">
                    {verifyMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4 mr-2" />
                        Verify &amp; Sign In
                      </>
                    )}
                  </Button>
                </form>
              </Form>
              <div className="mt-4 flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={backToPassword}
                  className="inline-flex items-center text-gray-500 hover:text-gray-700"
                  data-testid="button-back"
                >
                  <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => resendMutation.mutate()}
                  disabled={resendMutation.isPending}
                  className="text-blue-600 hover:text-blue-800 disabled:opacity-50"
                  data-testid="button-resend"
                >
                  {resendMutation.isPending ? "Sending..." : "Resend code"}
                </button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
