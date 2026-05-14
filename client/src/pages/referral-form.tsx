import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle, AlertCircle, Loader2, User, Stethoscope, FileText, Phone } from "lucide-react";
import { CANONICAL_SCAN_TYPES } from "@shared/schema";

type ClinicInfo = { name: string; logoUrl: string | null; phone: string | null; address: string | null };

export default function ReferralFormPage() {
  const { clinicId } = useParams<{ clinicId: string }>();
  const [clinicInfo, setClinicInfo] = useState<ClinicInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "submitted" | "error">("loading");
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    patientName: "",
    patientDob: "",
    patientPhone: "",
    patientEmail: "",
    referringDoctorName: "",
    referringDoctorPractice: "",
    referringDoctorPhone: "",
    referringDoctorEmail: "",
    referringDoctorProviderNumber: "",
    scanTypes: [] as string[],
    urgency: "routine",
    clinicalIndication: "",
    notes: "",
    resultMethod: "",
    resultMethodOther: "",
    _hp: "",
  });

  // Per-scan-type laterality: "bilateral" | "left" | "right".
  // Only meaningful for scan types where hasLaterality === true.
  const [scanLaterality, setScanLaterality] = useState<Record<string, "bilateral" | "left" | "right">>({});

  const lateralityOf = (name: string) =>
    CANONICAL_SCAN_TYPES.find((s) => s.name === name)?.hasLaterality ?? false;

  // Any selected scan type that has laterality but no side picked yet?
  const missingLaterality = form.scanTypes.some((n) => lateralityOf(n) && !scanLaterality[n]);

  useEffect(() => {
    fetch(`/api/public/clinic/${clinicId}/info`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Clinic not found");
        return r.json();
      })
      .then((data) => { setClinicInfo(data); setStatus("ready"); })
      .catch((e) => { setLoadError(e.message); setStatus("error"); });
  }, [clinicId]);

  const toggleScanType = (name: string) => {
    setForm((prev) => {
      const isOn = prev.scanTypes.includes(name);
      return {
        ...prev,
        scanTypes: isOn ? prev.scanTypes.filter((s) => s !== name) : [...prev.scanTypes, name],
      };
    });
    // When ticking a laterality scan, default to bilateral (most common request).
    // When unticking, clear the side so it doesn't linger.
    setScanLaterality((prev) => {
      const next = { ...prev };
      if (form.scanTypes.includes(name)) {
        delete next[name];
      } else if (lateralityOf(name) && !next[name]) {
        next[name] = "bilateral";
      }
      return next;
    });
  };

  const setSide = (name: string, side: "bilateral" | "left" | "right") => {
    setScanLaterality((prev) => ({ ...prev, [name]: side }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.patientName || form.scanTypes.length === 0) return;
    if (missingLaterality) return;
    setSubmitting(true);
    try {
      // Encode laterality directly into the scan type names so it flows through
      // unchanged into the internal request view, e.g. "Lower limb DVT (Left)".
      const scanTypesWithSide = form.scanTypes.map((name) => {
        if (!lateralityOf(name)) return name;
        const side = scanLaterality[name];
        if (!side) return name;
        const label = side === "bilateral" ? "Bilateral" : side === "left" ? "Left" : "Right";
        return `${name} (${label})`;
      });
      const payload = { ...form, scanTypes: scanTypesWithSide };
      const r = await fetch(`/api/public/referral/${clinicId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error || "Failed to submit");
      }
      setStatus("submitted");
    } catch (e: any) {
      alert(e.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

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
          <CardContent className="pt-8 pb-8 text-center space-y-3">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
            <h2 className="text-lg font-semibold">Referral Form Unavailable</h2>
            <p className="text-sm text-gray-500">{loadError}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "submitted") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-10 pb-10 text-center space-y-4">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
            <h2 className="text-xl font-bold text-gray-800">Referral Received</h2>
            <p className="text-gray-500 text-sm">
              Thank you. Your referral for <strong>{form.patientName}</strong> has been submitted to {clinicInfo?.name}.
              The team will be in touch to confirm an appointment.
            </p>
            {clinicInfo?.phone && (
              <p className="text-xs text-gray-400">Questions? Call {clinicInfo.phone}</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-xl mx-auto space-y-5">
        <div className="text-center space-y-2 mb-6">
          {clinicInfo?.logoUrl ? (
            <img src={clinicInfo.logoUrl} alt={clinicInfo.name || ""} className="h-14 object-contain mx-auto" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center mx-auto">
              <span className="text-white text-xl font-bold">{clinicInfo?.name?.[0] ?? "C"}</span>
            </div>
          )}
          <h1 className="text-xl font-bold text-gray-900">{clinicInfo?.name}</h1>
          <p className="text-gray-500 text-sm">Online Referral Form</p>
        </div>

        <p className="text-xs text-gray-400 text-right -mt-2">Fields marked <span className="text-red-500">*</span> are required</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Honeypot */}
          <input type="text" name="_hp" value={form._hp} onChange={(e) => setForm((p) => ({ ...p, _hp: e.target.value }))} style={{ display: "none" }} tabIndex={-1} autoComplete="off" />

          {/* Patient details */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-gray-700">
                <User className="w-4 h-4 text-blue-600" /> Patient Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-sm">Patient Full Name <span className="text-red-500">*</span></Label>
                <Input required value={form.patientName} onChange={(e) => setForm((p) => ({ ...p, patientName: e.target.value }))} placeholder="e.g. Jane Smith" className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm">Phone <span className="text-red-500">*</span></Label>
                  <Input required type="tel" value={form.patientPhone} onChange={(e) => setForm((p) => ({ ...p, patientPhone: e.target.value }))} placeholder="04xx xxx xxx" className="mt-1" />
                </div>
                <div>
                  <Label className="text-sm">Email <span className="text-red-500">*</span></Label>
                  <Input required type="email" value={form.patientEmail} onChange={(e) => setForm((p) => ({ ...p, patientEmail: e.target.value }))} placeholder="patient@email.com" className="mt-1" />
                </div>
              </div>
              <div>
                <Label className="text-sm">Date of Birth</Label>
                <Input type="date" value={form.patientDob} onChange={(e) => setForm((p) => ({ ...p, patientDob: e.target.value }))} className="mt-1" />
              </div>
            </CardContent>
          </Card>

          {/* Referring doctor */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-gray-700">
                <Stethoscope className="w-4 h-4 text-blue-600" /> Referring Doctor
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm">Doctor Name <span className="text-red-500">*</span></Label>
                  <Input required value={form.referringDoctorName} onChange={(e) => setForm((p) => ({ ...p, referringDoctorName: e.target.value }))} placeholder="Dr. John Doe" className="mt-1" />
                </div>
                <div>
                  <Label className="text-sm">Provider Number <span className="text-red-500">*</span></Label>
                  <Input required value={form.referringDoctorProviderNumber} onChange={(e) => setForm((p) => ({ ...p, referringDoctorProviderNumber: e.target.value }))} placeholder="e.g. 1234567A" className="mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm">Practice Name</Label>
                  <Input value={form.referringDoctorPractice} onChange={(e) => setForm((p) => ({ ...p, referringDoctorPractice: e.target.value }))} placeholder="e.g. City Medical" className="mt-1" />
                </div>
                <div>
                  <Label className="text-sm">Doctor Phone</Label>
                  <Input type="tel" value={form.referringDoctorPhone} onChange={(e) => setForm((p) => ({ ...p, referringDoctorPhone: e.target.value }))} className="mt-1" />
                </div>
              </div>
              <div>
                <Label className="text-sm">Doctor Email</Label>
                <Input
                  type="email"
                  value={form.referringDoctorEmail}
                  onChange={(e) => setForm((p) => ({ ...p, referringDoctorEmail: e.target.value }))}
                  placeholder="doctor@example.com"
                  className="mt-1"
                  data-testid="input-referring-doctor-email"
                />
                <p className="text-xs text-gray-500 mt-1">We'll send you a confirmation once the referral is received.</p>
              </div>
            </CardContent>
          </Card>

          {/* Scan types */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-gray-700">
                <FileText className="w-4 h-4 text-blue-600" /> Scan Type(s) *
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {CANONICAL_SCAN_TYPES.map((st) => {
                  const checked = form.scanTypes.includes(st.name);
                  const side = scanLaterality[st.name];
                  return (
                    <div key={st.name} className={`rounded p-1.5 transition-colors ${checked ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleScanType(st.name)}
                        />
                        <span className="text-sm">{st.name}</span>
                      </label>
                      {checked && st.hasLaterality && (
                        <div className="ml-6 mt-1.5 flex flex-wrap items-center gap-1.5">
                          {(["bilateral", "left", "right"] as const).map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setSide(st.name, opt)}
                              className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                                side === opt
                                  ? "bg-blue-600 text-white border-blue-600"
                                  : "bg-white text-gray-700 border-gray-300 hover:border-blue-400"
                              }`}
                            >
                              {opt === "bilateral" ? "Bilateral" : opt === "left" ? "Left" : "Right"}
                            </button>
                          ))}
                          {!side && (
                            <span className="text-[11px] text-red-500">Choose a side</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {form.scanTypes.length === 0 && (
                <p className="text-xs text-red-500 mt-2">Please select at least one scan type.</p>
              )}
              {missingLaterality && (
                <p className="text-xs text-red-500 mt-2">Please choose Bilateral, Left or Right for each scan above.</p>
              )}
            </CardContent>
          </Card>

          {/* Clinical details */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-gray-700">
                <Phone className="w-4 h-4 text-blue-600" /> Clinical Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-sm">Urgency <span className="text-red-500">*</span></Label>
                <Select value={form.urgency} onValueChange={(v) => setForm((p) => ({ ...p, urgency: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="routine">Routine</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="asap">ASAP</SelectItem>
                    <SelectItem value="stat">STAT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">Clinical Information <span className="text-red-500">*</span></Label>
                <Textarea required value={form.clinicalIndication} onChange={(e) => setForm((p) => ({ ...p, clinicalIndication: e.target.value }))} rows={3} placeholder="Reason for referral, symptoms, relevant history..." className="mt-1" />
              </div>
              <div>
                <Label className="text-sm">Additional Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Any other relevant information..." className="mt-1" />
              </div>
              <div>
                <Label className="text-sm">Method to receive results <span className="text-red-500">*</span></Label>
                <div className="mt-2 space-y-2">
                  {["Secure messaging", "Email", "Fax", "Other"].map((option) => (
                    <label key={option} className="flex items-center gap-2.5 cursor-pointer hover:bg-gray-50 rounded p-1.5 transition-colors">
                      <input
                        type="radio"
                        name="resultMethod"
                        value={option}
                        checked={form.resultMethod === option}
                        onChange={(e) => setForm((p) => ({ ...p, resultMethod: e.target.value, resultMethodOther: e.target.value !== "Other" ? "" : p.resultMethodOther }))}
                        className="w-4 h-4 accent-blue-600"
                      />
                      <span className="text-sm">{option === "Other" ? "Other (please specify)" : option}</span>
                    </label>
                  ))}
                  {form.resultMethod === "Other" && (
                    <Input
                      value={form.resultMethodOther}
                      onChange={(e) => setForm((p) => ({ ...p, resultMethodOther: e.target.value }))}
                      placeholder="Please specify..."
                      className="mt-1 ml-6 w-auto"
                    />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Button
            type="submit"
            className="w-full py-5 text-base"
            disabled={
              submitting ||
              !form.patientName ||
              !form.patientPhone ||
              !form.patientEmail ||
              !form.referringDoctorName ||
              !form.referringDoctorProviderNumber ||
              !form.clinicalIndication ||
              form.scanTypes.length === 0 ||
              missingLaterality ||
              !form.resultMethod ||
              (form.resultMethod === "Other" && !form.resultMethodOther.trim())
            }
          >
            {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting…</> : "Submit Referral"}
          </Button>

          <p className="text-center text-xs text-gray-400 pb-4">
            This referral will be received by {clinicInfo?.name} and is not a confirmed appointment.
          </p>
        </form>
      </div>
    </div>
  );
}
