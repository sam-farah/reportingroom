import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, KeyRound, ShieldCheck, ArrowLeft } from "lucide-react";

const emailSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});
type EmailFormData = z.infer<typeof emailSchema>;

const codeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});
type CodeFormData = z.infer<typeof codeSchema>;

// apiRequest throws Error("<status>: <body>") where body is usually JSON like
// { error: "..." }. Pull out the status and a clean message.
function parseError(error: Error): { status: number | null; message: string } {
  const raw = error?.message || "";
  const m = raw.match(/^(\d{3}):\s*([\s\S]*)$/);
  if (!m) return { status: null, message: raw };
  const status = parseInt(m[1], 10);
  let message = m[2];
  try {
    const parsed = JSON.parse(m[2]);
    if (parsed.error) message = parsed.error;
    else if (parsed.message) message = parsed.message;
  } catch {
    // body wasn't JSON — keep the raw text
  }
  return { status, message };
}

export default function PatientPortalLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // "email" = step 1, "code" = step 2 (SMS verification)
  const [step, setStep] = useState<"email" | "code">("email");

  const emailForm = useForm<EmailFormData>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  });

  const codeForm = useForm<CodeFormData>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: "" },
  });

  const requestMutation = useMutation({
    mutationFn: async (values: EmailFormData) => {
      const res = await apiRequest("/api/portal/login", "POST", values);
      return res.json();
    },
    onSuccess: () => {
      // Enumeration-safe: the server always reports success. Move to the code
      // step regardless — only a real account with a mobile on file will have
      // actually received a text.
      setStep("code");
      codeForm.reset({ code: "" });
    },
    onError: (error: Error) => {
      const { message } = parseError(error);
      toast({ title: "Something went wrong", description: message || "Please try again.", variant: "destructive" });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (values: CodeFormData) => {
      const res = await apiRequest("/api/portal/verify-code", "POST", values);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/me"] });
      setLocation("/patient-portal");
    },
    onError: (error: Error) => {
      const { status, message } = parseError(error);
      if (status === 440) {
        toast({ title: "Session expired", description: message || "Please start again.", variant: "destructive" });
        backToEmail();
        return;
      }
      toast({ title: "Verification failed", description: message || "Incorrect code. Please try again.", variant: "destructive" });
    },
  });

  const resendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/portal/resend-code", "POST", {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Code resent", description: "A new code is on its way." });
    },
    onError: (error: Error) => {
      const { status, message } = parseError(error);
      if (status === 440) backToEmail();
      toast({ title: "Could not resend", description: message || "Please try again shortly.", variant: "destructive" });
    },
  });

  const backToEmail = () => {
    setStep("email");
    codeForm.reset({ code: "" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="max-w-md w-full shadow-lg border-blue-100">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-blue-100 p-3 rounded-full">
              <KeyRound className="w-8 h-8 text-blue-600" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-slate-900">
            Patient Portal
          </CardTitle>
          <CardDescription className="text-slate-500 text-lg">
            {step === "email"
              ? "Sign in to access your secure medical reports"
              : "Enter the code we texted you"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "email" ? (
            <Form {...emailForm}>
              <form onSubmit={emailForm.handleSubmit((data) => requestMutation.mutate(data))} className="space-y-4">
                <FormField
                  control={emailForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} className="h-11" placeholder="example@email.com" autoComplete="email" autoCapitalize="none" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-lg font-semibold"
                  disabled={requestMutation.isPending}
                  data-testid="button-send-code"
                >
                  {requestMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send me a code
                </Button>
                <p className="text-xs text-center text-slate-400">
                  We'll text a 6-digit code to the mobile number your clinic has on file.
                </p>
              </form>
            </Form>
          ) : (
            <>
              <div className="mb-4 flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>
                  If we have your details and a mobile number on file, we've texted you a 6-digit code. Enter it below — it expires in 5 minutes. Not receiving it? Contact your clinic.
                </span>
              </div>
              <Form {...codeForm}>
                <form onSubmit={codeForm.handleSubmit((data) => verifyMutation.mutate(data))} className="space-y-4">
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
                            className="h-11 text-center text-2xl tracking-[0.5em] font-mono"
                            {...field}
                            data-testid="input-code"
                            autoFocus
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-lg font-semibold"
                    disabled={verifyMutation.isPending}
                    data-testid="button-verify"
                  >
                    {verifyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Verify &amp; Sign In
                  </Button>
                </form>
              </Form>
              <div className="mt-4 flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={backToEmail}
                  className="inline-flex items-center text-slate-500 hover:text-slate-700"
                  data-testid="button-back"
                >
                  <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => resendMutation.mutate()}
                  disabled={resendMutation.isPending}
                  className="text-blue-600 hover:text-blue-800 disabled:opacity-50 font-medium"
                  data-testid="button-resend"
                >
                  {resendMutation.isPending ? "Sending..." : "Resend code"}
                </button>
              </div>
            </>
          )}
        </CardContent>
        <CardFooter className="flex flex-col space-y-2 border-t pt-4">
          <p className="text-xs text-center text-slate-400">
            Secure access managed by {import.meta.env.VITE_CLINIC_NAME || "Reporting Room"}.
            Protected by medical-grade encryption.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
