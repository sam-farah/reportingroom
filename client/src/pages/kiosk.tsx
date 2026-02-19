import { useState, useEffect, useRef } from "react";
import { Search, CheckCircle, Clock, ArrowLeft, UserCheck } from "lucide-react";
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

export default function Kiosk() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchName, setSearchName] = useState("");
  const [appointments, setAppointments] = useState<KioskAppointment[]>([]);
  const [searching, setSearching] = useState(false);
  const [checkedIn, setCheckedIn] = useState<number | null>(null);
  const [checkingIn, setCheckingIn] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (searchName.trim().length === 0) {
      setAppointments([]);
      return;
    }

    debounceRef.current = setTimeout(() => {
      searchAppointments(searchName.trim());
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchName]);

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
          description: "You have been checked in successfully. Please take a seat.",
        });

        setTimeout(() => {
          setCheckedIn(null);
          setSearchName("");
          setAppointments([]);
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

  if (checkedIn) {
    const apt = appointments.find(a => a.id === checkedIn);
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 to-blue-50 flex flex-col items-center justify-center p-8">
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
            Please take a seat. We will call you shortly.
          </p>
          <p className="text-sm text-gray-400 mt-8">
            This screen will reset automatically...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-blue-50 flex flex-col">
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
          <img src={logoIconPath} alt="Logo" className="h-6 w-6" />
          <span className="text-sm text-gray-500">Kiosk Mode</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8 pb-16">
        <div className="w-full max-w-2xl text-center">
          <div className="mb-12">
            <UserCheck className="w-16 h-16 text-teal-600 mx-auto mb-6" />
            <h1 className="text-5xl font-bold text-gray-800 mb-4">
              Patient Check-In
            </h1>
            <p className="text-xl text-gray-500">
              Enter your name below to check in for your appointment
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
              {appointments.map((apt) => (
                <div
                  key={apt.id}
                  className="bg-white rounded-2xl p-6 shadow-md flex items-center justify-between hover:shadow-lg transition-shadow"
                >
                  <div className="text-left">
                    <h3 className="text-2xl font-semibold text-gray-800">
                      {apt.patientName}
                    </h3>
                    <div className="flex items-center gap-4 mt-2 text-gray-500">
                      <span className="flex items-center gap-1 text-lg">
                        <Clock className="w-5 h-5" />
                        {format(new Date(apt.appointmentDate), "h:mm a")}
                      </span>
                      {apt.scanType && (
                        <span className="text-lg">{apt.scanType}</span>
                      )}
                    </div>
                  </div>
                  <div>
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
              ))}
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
