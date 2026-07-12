import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Loader2,
  LogIn,
  ShieldCheck,
  ArrowLeft,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Activity,
  FileText,
  Sparkles,
} from "lucide-react";
import logoIconPath from "@assets/Screenshot 2025-07-26 201200_1753524822284.png";

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
  const [showPassword, setShowPassword] = useState(false);

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

  const idleLogout =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("reason") === "idle";

  return (
    <div className="min-h-screen w-full lg:grid lg:grid-cols-[1.05fr_1fr] bg-slate-50">
      {/* ---------- Brand panel ---------- */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-12 text-white">
        {/* decorative glow blobs */}
        <div className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-[28rem] w-[28rem] translate-x-1/3 translate-y-1/3 rounded-full bg-teal-400/20 blur-3xl" />
        {/* subtle vascular pulse line */}
        <svg
          className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 w-full opacity-[0.12]"
          viewBox="0 0 1200 200"
          fill="none"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0 100 H360 l30 -64 40 128 34 -96 30 64 H720 l40 -40 40 40 H1200"
            stroke="url(#pulse)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <defs>
            <linearGradient id="pulse" x1="0" y1="0" x2="1200" y2="0" gradientUnits="userSpaceOnUse">
              <stop stopColor="#38bdf8" stopOpacity="0" />
              <stop offset="0.5" stopColor="#5eead4" />
              <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>

        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
            <img src={logoIconPath} alt="Reporting Room" className="logo-animated h-8 w-8 object-contain" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Reporting Room</span>
        </div>

        <div className="relative z-10 max-w-md">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-teal-200 ring-1 ring-white/15 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />
            AI-assisted medical reporting
          </div>
          <h1 className="text-4xl font-bold leading-tight tracking-tight">
            Precise reports,
            <br />
            <span className="bg-gradient-to-r from-teal-300 to-blue-300 bg-clip-text text-transparent">
              faster than ever.
            </span>
          </h1>
          <p className="mt-4 text-base leading-relaxed text-slate-300">
            Turn ultrasound worksheets into polished, physician-ready reports with consistent
            terminology across every clinic and user.
          </p>

          <ul className="mt-8 space-y-4">
            {[
              { icon: Activity, text: "AI worksheet analysis with exact clinical language" },
              { icon: FileText, text: "Professional, branded report generation" },
              { icon: ShieldCheck, text: "End-to-end encryption & SMS two-factor security" },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-slate-200">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <Icon className="h-4.5 w-4.5 text-teal-300" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 text-xs text-slate-400">
          &copy; {new Date().getFullYear()} Reporting Room. Secure medical reporting platform.
        </div>
      </aside>

      {/* ---------- Form panel ---------- */}
      <main className="flex min-h-screen items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/15">
              <img src={logoIconPath} alt="Reporting Room" className="logo-animated h-7 w-7 object-contain" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-slate-900">Reporting Room</span>
          </div>

          {step === "password" && (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold tracking-tight text-slate-900">Welcome back</h2>
                <p className="mt-1.5 text-sm text-slate-500">
                  Sign in to continue to your workspace.
                </p>
              </div>

              {idleLogout && (
                <div
                  className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900"
                  data-testid="banner-idle-logout"
                >
                  You were signed out automatically after 1 hour of inactivity. Please sign in again to continue.
                </div>
              )}
              {noPhone && (
                <div
                  className="mb-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-900"
                  data-testid="banner-no-phone"
                >
                  No mobile number is on file for your account. Sign-in now requires a one-time code by
                  text message. Please ask your clinic administrator to add your mobile number.
                </div>
              )}

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-700">Username or Email</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <Input
                              type="text"
                              autoComplete="username"
                              autoCapitalize="none"
                              autoCorrect="off"
                              spellCheck={false}
                              placeholder="Enter your username or email"
                              className="h-11 pl-10"
                              {...field}
                              data-testid="input-email"
                            />
                          </div>
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
                        <FormLabel className="text-slate-700">Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <Input
                              type={showPassword ? "text" : "password"}
                              autoComplete="current-password"
                              placeholder="Enter your password"
                              className="h-11 pl-10 pr-10"
                              {...field}
                              data-testid="input-password"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword((v) => !v)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition-colors hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label={showPassword ? "Hide password" : "Show password"}
                              data-testid="button-toggle-password"
                            >
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="h-11 w-full text-sm font-semibold shadow-sm"
                    disabled={loginMutation.isPending}
                    data-testid="button-signin"
                  >
                    {loginMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      <>
                        <LogIn className="mr-2 h-4 w-4" />
                        Sign In
                      </>
                    )}
                  </Button>
                </form>
              </Form>

              <div className="mt-8 flex items-center gap-2 rounded-lg bg-slate-100/80 px-3.5 py-3 text-xs text-slate-500">
                <ShieldCheck className="h-4 w-4 flex-shrink-0 text-slate-400" />
                Access is by invitation only. Contact your clinic administrator for access.
              </div>
            </>
          )}

          {step === "code" && (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                  Two-step verification
                </h2>
                <p className="mt-1.5 text-sm text-slate-500">
                  Enter the code we sent to keep your account secure.
                </p>
              </div>

              <div className="mb-6 flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50 px-3.5 py-3 text-sm text-blue-900">
                <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
                <span>
                  We've texted a 6-digit code{phoneHint ? ` to ${phoneHint}` : " to your mobile"}. Enter
                  it below to finish signing in. The code expires in 5 minutes.
                </span>
              </div>

              <Form {...codeForm}>
                <form onSubmit={codeForm.handleSubmit(onVerify)} className="space-y-5">
                  <FormField
                    control={codeForm.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-700">Verification code</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            placeholder="000000"
                            className="h-14 text-center text-2xl font-mono tracking-[0.5em]"
                            {...field}
                            data-testid="input-code"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="h-11 w-full text-sm font-semibold shadow-sm"
                    disabled={verifyMutation.isPending}
                    data-testid="button-verify"
                  >
                    {verifyMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Verify &amp; Sign In
                      </>
                    )}
                  </Button>
                </form>
              </Form>

              <div className="mt-6 flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={backToPassword}
                  className="inline-flex items-center font-medium text-slate-500 transition-colors hover:text-slate-800"
                  data-testid="button-back"
                >
                  <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => resendMutation.mutate()}
                  disabled={resendMutation.isPending}
                  className="font-medium text-primary transition-colors hover:text-primary/80 disabled:opacity-50"
                  data-testid="button-resend"
                >
                  {resendMutation.isPending ? "Sending..." : "Resend code"}
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
