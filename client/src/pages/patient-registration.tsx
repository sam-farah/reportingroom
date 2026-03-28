import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, AlertCircle, Loader2, User, Phone, Mail, Shield, Heart } from "lucide-react";

type FormState = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string;
  email: string;
  medicareNumber: string;
  medicareIrn: string;
  medicareExpiry: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
};

type PageData = {
  clinicName: string;
  clinicLogoUrl: string | null;
  clinicPhone: string | null;
  patient: Partial<FormState>;
};

function capitalizeWords(str: string) {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function PatientRegistrationPage() {
  const { token } = useParams<{ token: string }>();

  const [status, setStatus] = useState<"loading" | "ready" | "submitted" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pageData, setPageData] = useState<PageData | null>(null);

  const [form, setForm] = useState<FormState>({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    phone: "",
    email: "",
    medicareNumber: "",
    medicareIrn: "",
    medicareExpiry: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
  });

  useEffect(() => {
    fetch(`/api/patient-registration/${token}`)
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data.error || "Invalid or expired link");
        }
        return r.json();
      })
      .then((data: PageData) => {
        setPageData(data);
        setForm({
          firstName: data.patient.firstName || "",
          lastName: data.patient.lastName || "",
          dateOfBirth: data.patient.dateOfBirth || "",
          phone: data.patient.phone || "",
          email: data.patient.email || "",
          medicareNumber: data.patient.medicareNumber || "",
          medicareIrn: data.patient.medicareIrn || "",
          medicareExpiry: data.patient.medicareExpiry || "",
          emergencyContactName: data.patient.emergencyContactName || "",
          emergencyContactPhone: data.patient.emergencyContactPhone || "",
        });
        setStatus("ready");
      })
      .catch((e) => {
        setErrorMsg(e.message);
        setStatus("error");
      });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName || !form.lastName) return;
    setSubmitting(true);
    try {
      const r = await fetch(`/api/patient-registration/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error || "Failed to submit");
      }
      setStatus("submitted");
    } catch (e: any) {
      setErrorMsg(e.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const field = (key: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <AlertCircle className="w-14 h-14 text-red-500 mx-auto" />
            <h2 className="text-xl font-semibold text-gray-800">Link Unavailable</h2>
            <p className="text-gray-500 text-sm">{errorMsg}</p>
            <p className="text-gray-400 text-xs">If you need a new registration link, please contact the clinic.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "submitted") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <CheckCircle className="w-14 h-14 text-green-500 mx-auto" />
            <h2 className="text-xl font-semibold text-gray-800">Registration Complete!</h2>
            <p className="text-gray-500 text-sm">
              Thank you, {form.firstName}. Your details have been saved. You can close this window.
            </p>
            {pageData?.clinicPhone && (
              <p className="text-gray-400 text-xs">Questions? Call us on {pageData.clinicPhone}</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Clinic header */}
        <div className="text-center space-y-2">
          {pageData?.clinicLogoUrl ? (
            <img
              src={pageData.clinicLogoUrl}
              alt={pageData.clinicName}
              className="h-16 object-contain mx-auto"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center mx-auto">
              <span className="text-white text-2xl font-bold">{pageData?.clinicName?.[0] ?? "C"}</span>
            </div>
          )}
          <h1 className="text-xl font-bold text-gray-900">{pageData?.clinicName}</h1>
          <p className="text-gray-500 text-sm">Patient Registration Form</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Personal details */}
          <Card>
            <CardHeader className="pb-3 pt-5">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="w-4 h-4 text-blue-600" /> Personal Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="firstName" className="text-sm">First Name *</Label>
                  <Input
                    id="firstName"
                    required
                    value={form.firstName}
                    onChange={(e) => field("firstName", capitalizeWords(e.target.value))}
                    autoCapitalize="words"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="lastName" className="text-sm">Last Name *</Label>
                  <Input
                    id="lastName"
                    required
                    value={form.lastName}
                    onChange={(e) => field("lastName", capitalizeWords(e.target.value))}
                    autoCapitalize="words"
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="dob" className="text-sm">Date of Birth</Label>
                <Input
                  id="dob"
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) => field("dateOfBirth", e.target.value)}
                  className="mt-1"
                />
              </div>
            </CardContent>
          </Card>

          {/* Contact */}
          <Card>
            <CardHeader className="pb-3 pt-5">
              <CardTitle className="text-base flex items-center gap-2">
                <Phone className="w-4 h-4 text-blue-600" /> Contact Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="phone" className="text-sm">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => field("phone", e.target.value)}
                  placeholder="e.g. 0412 345 678"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="email" className="text-sm">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => field("email", e.target.value)}
                  placeholder="e.g. jane@example.com"
                  className="mt-1"
                />
              </div>
            </CardContent>
          </Card>

          {/* Medicare */}
          <Card>
            <CardHeader className="pb-3 pt-5">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-600" /> Medicare Details
                <span className="text-xs font-normal text-gray-400">(optional)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-5 gap-2">
                <div className="col-span-3">
                  <Label htmlFor="medicareNumber" className="text-sm">Medicare Number</Label>
                  <Input
                    id="medicareNumber"
                    value={form.medicareNumber}
                    onChange={(e) => field("medicareNumber", e.target.value.replace(/\D/g, ""))}
                    maxLength={15}
                    placeholder="e.g. 2123456701"
                    className="mt-1"
                  />
                </div>
                <div className="col-span-1">
                  <Label htmlFor="medicareIrn" className="text-sm">IRN</Label>
                  <Input
                    id="medicareIrn"
                    value={form.medicareIrn}
                    onChange={(e) => field("medicareIrn", e.target.value.replace(/\D/g, ""))}
                    maxLength={2}
                    placeholder="1"
                    className="mt-1"
                  />
                </div>
                <div className="col-span-1">
                  <Label htmlFor="medicareExpiry" className="text-sm">Expiry</Label>
                  <Input
                    id="medicareExpiry"
                    value={form.medicareExpiry}
                    onChange={(e) => {
                      let val = e.target.value.replace(/[^0-9/]/g, "");
                      if (val.length === 2 && !val.includes("/") && form.medicareExpiry.length === 1) val += "/";
                      field("medicareExpiry", val);
                    }}
                    maxLength={7}
                    placeholder="MM/YYYY"
                    className="mt-1"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Emergency contact */}
          <Card>
            <CardHeader className="pb-3 pt-5">
              <CardTitle className="text-base flex items-center gap-2">
                <Heart className="w-4 h-4 text-red-500" /> Emergency Contact
                <span className="text-xs font-normal text-gray-400">(optional)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="ecName" className="text-sm">Contact Name</Label>
                <Input
                  id="ecName"
                  value={form.emergencyContactName}
                  onChange={(e) => field("emergencyContactName", capitalizeWords(e.target.value))}
                  placeholder="e.g. John Smith"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="ecPhone" className="text-sm">Contact Phone</Label>
                <Input
                  id="ecPhone"
                  type="tel"
                  value={form.emergencyContactPhone}
                  onChange={(e) => field("emergencyContactPhone", e.target.value)}
                  placeholder="e.g. 0412 345 678"
                  className="mt-1"
                />
              </div>
            </CardContent>
          </Card>

          <Button
            type="submit"
            className="w-full text-base py-5"
            disabled={submitting || !form.firstName || !form.lastName}
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting…</>
            ) : (
              "Submit Registration"
            )}
          </Button>

          <p className="text-center text-xs text-gray-400 pb-4">
            Your information is stored securely and used only for your medical care at {pageData?.clinicName}.
          </p>
        </form>
      </div>
    </div>
  );
}
