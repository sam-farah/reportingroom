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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, CheckCircle2, ShieldCheck, ArrowLeft, AlertTriangle } from "lucide-react";

const codeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});
type CodeFormData = z.infer<typeof codeSchema>;

interface InviteData {
  invitation: {
    email: string;
    token: string;
  };
  patientFirstName: string;
  clinicName: string;
  clinicLogoUrl: string | null;
  hasExistingAccount: boolean;
}

// apiRequest throws Error("<status>: <body>") where body is usually JSON like
// { error: "...", code: "..." }. Pull out the status, optional code, message.
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
    if (parsed.error) message = parsed.error;
    else if (parsed.message) message = parsed.message;
  } catch {
    // body wasn't JSON — keep the raw text
  }
  return { status, code, message };
}

export default function PatientPortalInvite() {
  const [, params] = useRoute("/patient-portal/invite/:token");
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // "start" = press the button to receive a code, "code" = enter the code
  const [step, setStep] = useState<"start" | "code">("start");
  const [noPhone, setNoPhone] = useState(false);

  const { data: invite, isLoading, error } = useQuery<InviteData>({
    queryKey: ["/api/portal/invite", params?.token],
    enabled: !!params?.token,
  });

  const codeForm = useForm<CodeFormData>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: "" },
  });

  const requestMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/portal/invite/request-code", "POST", { token: params?.token });
      return res.json();
    },
    onSuccess: () => {
      setStep("code");
      codeForm.reset({ code: "" });
      toast({ title: "Code sent", description: "Check your phone for a 6-digit code." });
    },
    onError: (error: Error) => {
      const { code, message } = parseError(error);
      if (code === "NO_PHONE" || /no mobile number/i.test(message)) {
        setNoPhone(true);
        return;
      }
      toast({ title: "Could not send code", description: message || "Please try again.", variant: "destructive" });
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
        setStep("start");
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
      if (status === 440) setStep("start");
      toast({ title: "Could not resend", description: message || "Please try again shortly.", variant: "destructive" });
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
            {invite.clinicLogoUrl ? (
              <img
                src={invite.clinicLogoUrl}
                alt={invite.clinicName}
                className="h-16 max-w-[200px] object-contain"
              />
            ) : (
              <div className="bg-blue-100 p-3 rounded-full">
                <CheckCircle2 className="w-8 h-8 text-blue-600" />
              </div>
            )}
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-slate-900">
            Welcome{invite.patientFirstName ? `, ${invite.patientFirstName}` : ""}
          </CardTitle>
          <CardDescription className="text-slate-500 text-lg">
            {step === "start" ? `Access your medical records at ${invite.clinicName}` : "Enter the code we texted you"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 text-blue-800 text-sm">
            Setting up secure portal access at <strong>{invite.clinicName}</strong>.
          </div>

          {noPhone && (
            <div className="p-4 bg-red-50 rounded-lg border border-red-200 text-red-800 text-sm flex gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                We don't have a mobile number on file for you. Sign-in uses a one-time code sent by text message. Please contact your clinic to add your mobile number.
              </span>
            </div>
          )}

          {step === "start" ? (
            <>
              <p className="text-sm text-slate-600">
                We'll text a 6-digit code to the mobile number your clinic has on file to confirm it's you — no password needed.
              </p>
              <Button
                className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-lg font-semibold"
                disabled={requestMutation.isPending}
                onClick={() => { setNoPhone(false); requestMutation.mutate(); }}
                data-testid="button-send-code"
              >
                {requestMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send me a code
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>We've texted a 6-digit code to your mobile. Enter it below — it expires in 5 minutes.</span>
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
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => setStep("start")}
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
      </Card>
    </div>
  );
}
