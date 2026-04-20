import { useState, useEffect, useRef } from "react";
import { Search, CheckCircle, Clock, ArrowLeft, UserCheck, ClipboardList, QrCode, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useLocation } from "wouter";
import logoIconPath from "@assets/Screenshot 2025-07-26 201200_1753524822284.png";

interface KioskAppointment {
  id: number;
  patientName: string;
  appointmentDate: string;
  duration: number;
  scanType: string | null;
  status: string;
}

interface KioskSettings {
  clinicName: string;
  kioskLogoUrl: string | null;
  kioskWelcomeText: string;
  kioskInstructions: string;
  kioskSuccessMessage: string;
  kioskBackgroundColor: string | null;
}

interface RegistrationStatus {
  registered: boolean;
  hasPatient: boolean;
  registrationUrl?: string;
  token?: string;
}

export default function Kiosk() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchName, setSearchName] = useState("");
  const [appointments, setAppointments] = useState<KioskAppointment[]>([]);
  const [searching, setSearching] = useState(false);
  const [checkedIn, setCheckedIn] = useState<number | null>(null);
  const [checkingIn, setCheckingIn] = useState<number | null>(null);
  const [settings, setSettings] = useState<KioskSettings | null>(null);
  const [regStatus, setRegStatus] = useState<Record<number, RegistrationStatus>>({});
  const [registerFor, setRegisterFor] = useState<{ apt: KioskAppointment; status: RegistrationStatus } | null>(null);
  const [registerMode, setRegisterMode] = useState<"qr" | "form" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    fetch('/api/kiosk/settings')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setSettings(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (searchName.trim().length === 0) {
      setAppointments([]);
      setRegStatus({});
      return;
    }

    debounceRef.current = setTimeout(() => {
      searchAppointments(searchName.trim());
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchName]);

  // When appointments load, fetch registration status for each one in parallel
  useEffect(() => {
    if (appointments.length === 0) return;
    appointments.forEach(async (apt) => {
      if (regStatus[apt.id]) return;
      try {
        const res = await fetch(`/api/kiosk/registration-status/${apt.id}`);
        if (res.ok) {
          const data: RegistrationStatus = await res.json();
          setRegStatus(prev => ({ ...prev, [apt.id]: data }));
        }
      } catch {}
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointments]);

  // While the registration dialog is open, poll for completion to auto-advance to check-in
  useEffect(() => {
    if (!registerFor) return;
    const aptId = registerFor.apt.id;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/kiosk/registration-status/${aptId}`);
        if (res.ok) {
          const data: RegistrationStatus = await res.json();
          setRegStatus(prev => ({ ...prev, [aptId]: data }));
          if (data.registered) {
            clearInterval(interval);
            setRegisterFor(null);
            setRegisterMode(null);
            toast({
              title: "Registration complete",
              description: "Thank you. You can now check in.",
            });
          }
        }
      } catch {}
    }, 4000);
    return () => clearInterval(interval);
  }, [registerFor, toast]);

  const searchAppointments = async (query: string) => {
    setSearching(true);
    try {
      const res = await fetch(`/api/kiosk/appointments/today?search=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setAppointments(data);
      }
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setSearching(false);
    }
  };

  const handleCheckIn = async (appointmentId: number) => {
    setCheckingIn(appointmentId);
    try {
      const res = await fetch(`/api/kiosk/checkin/${appointmentId}`, { method: 'POST' });
      if (res.ok) {
        setCheckedIn(appointmentId);
        toast({
          title: "Checked In",
          description: "You have been checked in successfully.",
        });

        setTimeout(() => {
          setCheckedIn(null);
          setSearchName("");
          setAppointments([]);
          setRegStatus({});
          inputRef.current?.focus();
        }, 5000);
      } else {
        const data = await res.json();
        toast({
          title: "Check-in Failed",
          description: data.error || "Unable to check in. Please ask reception for help.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Something went wrong. Please ask reception for help.",
        variant: "destructive",
      });
    } finally {
      setCheckingIn(null);
    }
  };

  const bgStyle = settings?.kioskBackgroundColor
    ? { background: settings.kioskBackgroundColor }
    : { background: 'linear-gradient(to bottom right, #f0fdfa, #eff6ff)' };

  if (checkedIn) {
    const apt = appointments.find(a => a.id === checkedIn);
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8" style={bgStyle}>
        <div className="text-center max-w-2xl">
          <div className="w-32 h-32 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-8">
            <CheckCircle className="w-20 h-20 text-green-600" />
          </div>
          <h1 className="text-5xl font-bold text-green-700 mb-4">
            You're Checked In!
          </h1>
          {apt && (
            <p className="text-2xl text-gray-600 mb-4">
              Welcome, {apt.patientName}
            </p>
          )}
          <p className="text-xl text-gray-500">
            {settings?.kioskSuccessMessage || "Please take a seat. We will call you shortly."}
          </p>
          <p className="text-sm text-gray-400 mt-8">
            This screen will reset automatically...
          </p>
        </div>
      </div>
    );
  }

  // Registration screen — full takeover when patient picks a registration method
  if (registerFor && registerMode) {
    const url = registerFor.status.registrationUrl;
    return (
      <div className="min-h-screen flex flex-col" style={bgStyle}>
        <div className="p-4 flex justify-between items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setRegisterFor(null); setRegisterMode(null); }}
            className="text-gray-500 hover:text-gray-700"
            data-testid="button-back-to-checkin"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <span className="text-sm text-gray-500">Registration for {registerFor.apt.patientName}</span>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-8 pb-16">
          {registerMode === "qr" && url && (
            <div className="text-center max-w-xl">
              <div className="mb-8">
                <QrCode className="w-12 h-12 text-teal-600 mx-auto mb-4" />
                <h1 className="text-4xl font-bold text-gray-800 mb-3">Scan to Register</h1>
                <p className="text-lg text-gray-500">
                  Open your phone camera and point it at the QR code.<br />
                  Complete the form on your phone.
                </p>
              </div>
              <div className="bg-white p-8 rounded-3xl shadow-lg inline-block">
                <QRCodeSVG value={url} size={320} level="M" includeMargin={false} />
              </div>
              <p className="text-sm text-gray-400 mt-6 break-all px-4">{url}</p>
              <p className="text-base text-gray-500 mt-6">
                This screen will continue automatically once you finish on your phone.
              </p>
              <div className="mt-6">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setRegisterMode("form")}
                  className="text-lg"
                >
                  Use this screen instead
                </Button>
              </div>
            </div>
          )}

          {registerMode === "form" && url && (
            <div className="w-full max-w-3xl flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-lg text-gray-600">
                  Please complete the registration form below.
                </p>
                <Button
                  variant="outline"
                  onClick={() => setRegisterMode("qr")}
                >
                  <QrCode className="w-4 h-4 mr-1" /> Show QR instead
                </Button>
              </div>
              <iframe
                src={url}
                className="flex-1 w-full bg-white rounded-2xl shadow-lg border border-gray-200"
                title="Patient Registration"
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  const logoSrc = settings?.kioskLogoUrl || null;

  return (
    <div className="min-h-screen flex flex-col" style={bgStyle}>
      <div className="p-4 flex justify-between items-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/")}
          className="text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Exit Kiosk
        </Button>
        <div className="flex items-center gap-2">
          <img src={logoSrc || logoIconPath} alt="Logo" className="h-6 w-6" />
          <span className="text-sm text-gray-500">Kiosk Mode</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8 pb-16">
        <div className="w-full max-w-2xl text-center">
          <div className="mb-12">
            {logoSrc ? (
              <img src={logoSrc} alt="Clinic Logo" className="max-h-24 max-w-[300px] object-contain mx-auto mb-6" />
            ) : (
              <UserCheck className="w-16 h-16 text-teal-600 mx-auto mb-6" />
            )}
            <h1 className="text-5xl font-bold text-gray-800 mb-4">
              {settings?.kioskWelcomeText || "Patient Check-In"}
            </h1>
            <p className="text-xl text-gray-500">
              {settings?.kioskInstructions || "Enter your name below to check in for your appointment"}
            </p>
          </div>

          <div className="relative mb-8">
            <Search className="absolute left-6 top-1/2 transform -translate-y-1/2 w-7 h-7 text-gray-400" />
            <Input
              ref={inputRef}
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              placeholder="Type your name here..."
              className="w-full h-20 pl-16 pr-6 text-2xl rounded-2xl border-2 border-gray-200 focus:border-teal-500 focus:ring-teal-500 shadow-lg"
            />
          </div>

          {searching && (
            <p className="text-lg text-gray-400 animate-pulse">Searching...</p>
          )}

          {!searching && searchName.trim().length > 0 && appointments.length === 0 && (
            <div className="bg-white rounded-2xl p-8 shadow-md">
              <p className="text-xl text-gray-500">
                No appointments found for today matching "{searchName}"
              </p>
              <p className="text-base text-gray-400 mt-2">
                Please check your name or ask reception for help
              </p>
            </div>
          )}

          {appointments.length > 0 && (
            <div className="space-y-4">
              <p className="text-lg text-gray-500 mb-4">
                {appointments.length} appointment{appointments.length !== 1 ? 's' : ''} found for today
              </p>
              {appointments.map((apt) => {
                const status = regStatus[apt.id];
                const needsRegistration = status && !status.registered;
                return (
                  <div
                    key={apt.id}
                    className="bg-white rounded-2xl p-6 shadow-md hover:shadow-lg transition-shadow"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="text-left min-w-0">
                        <h3 className="text-2xl font-semibold text-gray-800 truncate">
                          {apt.patientName}
                        </h3>
                        <div className="flex items-center gap-4 mt-2 text-gray-500 flex-wrap">
                          <span className="flex items-center gap-1 text-lg">
                            <Clock className="w-5 h-5" />
                            {format(new Date(apt.appointmentDate), "h:mm a")}
                          </span>
                          {apt.scanType && (
                            <span className="text-lg">{apt.scanType}</span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {apt.status === 'checked_in' ? (
                          <div className="flex items-center gap-2 text-green-600 text-lg font-medium px-6 py-3">
                            <CheckCircle className="w-6 h-6" />
                            Already Checked In
                          </div>
                        ) : (
                          <Button
                            onClick={() => handleCheckIn(apt.id)}
                            disabled={checkingIn === apt.id}
                            className="bg-teal-600 hover:bg-teal-700 text-white text-xl px-8 py-6 rounded-xl h-auto"
                          >
                            {checkingIn === apt.id ? (
                              "Checking In..."
                            ) : (
                              <>
                                <CheckCircle className="w-6 h-6 mr-2" />
                                Check In
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>

                    {needsRegistration && status?.registrationUrl && apt.status !== 'checked_in' && (
                      <div className="mt-5 p-5 rounded-xl bg-amber-50 border-2 border-amber-200 text-left">
                        <div className="flex items-start gap-3 mb-4">
                          <ClipboardList className="w-7 h-7 text-amber-700 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-lg font-semibold text-amber-900">
                              Please complete your registration first
                            </p>
                            <p className="text-base text-amber-800 mt-1">
                              We don't have all your details on file yet. It only takes a minute.
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3">
                          <Button
                            onClick={() => { setRegisterFor({ apt, status }); setRegisterMode("form"); }}
                            className="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-lg py-5 rounded-xl h-auto"
                            data-testid={`button-register-form-${apt.id}`}
                          >
                            <ClipboardList className="w-5 h-5 mr-2" />
                            Register on this screen
                          </Button>
                          <Button
                            onClick={() => { setRegisterFor({ apt, status }); setRegisterMode("qr"); }}
                            variant="outline"
                            className="flex-1 border-2 border-amber-300 text-amber-800 hover:bg-amber-100 text-lg py-5 rounded-xl h-auto"
                            data-testid={`button-register-qr-${apt.id}`}
                          >
                            <QrCode className="w-5 h-5 mr-2" />
                            Scan QR with my phone
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="p-4 text-center text-sm text-gray-400">
        {format(new Date(), "EEEE, MMMM d, yyyy")}
      </div>
    </div>
  );
}
