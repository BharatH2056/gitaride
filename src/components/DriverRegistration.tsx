import { useState } from "react";
import { Car, User, Phone, Truck, Hash, Palette, Calendar, ChevronRight, CheckCircle } from "lucide-react";

interface DriverRegistrationProps {
  userId: string;
  userName: string;
  onComplete: (driverData: any) => void;
  onBack: () => void;
}

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function DriverRegistration({ userId, userName, onComplete, onBack }: DriverRegistrationProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: userName || "",
    phone: "",
    vehicleMake: "",
    vehicleModel: "",
    vehicleYear: new Date().getFullYear().toString(),
    vehicleColor: "",
    plateNumber: "",
  });

  const [locationInput, setLocationInput] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState<any[]>([]);
  const [chosenLocation, setChosenLocation] = useState<{ lat: number; lng: number } | null>(null);

  const update = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setError("");
  };

  const validateStep1 = () => {
    if (!form.name.trim()) return "Please enter your full name";
    if (!form.phone.trim() || form.phone.length < 10) return "Please enter a valid phone number";
    return "";
  };

  const searchLocation = async (val: string) => {
    setLocationInput(val);
    if (val.length < 2) return;
    try {
      const res = await fetch(`${API_BASE}/api/places/search?q=${encodeURIComponent(val)}`);
      if (res.ok) {
        const data = await res.json();
        setLocationSuggestions(data.places || []);
      }
    } catch { }
  };

  const useGPS = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async pos => {
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setChosenLocation(loc);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${loc.lat}&lon=${loc.lng}`
        );
        const data = await res.json();
        setLocationInput(data.display_name?.split(",").slice(0, 2).join(", ") || "Current Location");
      } catch {
        setLocationInput("Current Location");
      }
      setLocationSuggestions([]);
    });
  };

  const validateStep2 = () => {
    if (!form.vehicleMake.trim()) return "Please enter your car brand";
    if (!form.vehicleModel.trim()) return "Please enter your car model";
    if (!form.vehicleColor.trim()) return "Please enter your car color";
    if (!form.plateNumber.trim()) return "Please enter your number plate";
    if (form.plateNumber.trim().length < 4) return "Please enter a valid number plate";
    return "";
  };

  const handleNext = () => {
    const err = validateStep1();
    if (err) { setError(err); return; }
    setStep(2);
  };

  const handleSubmit = async () => {
    const err = validateStep2();
    if (err) { setError(err); return; }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/driver/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          name: form.name.trim(),
          phone: form.phone.trim(),
          vehicle: {
            make: form.vehicleMake.trim(),
            model: form.vehicleModel.trim(),
            year: form.vehicleYear,
            color: form.vehicleColor.trim(),
            plateNumber: form.plateNumber.trim().toUpperCase()
          },
          location: chosenLocation || { lat: 12.9716, lng: 77.5946 }
        })
      });

      if (res.ok) {
        const data = await res.json();
        onComplete(data.driver);
      } else {
        const data = await res.json();
        setError(data.error || "Registration failed. Try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const CAR_COLORS = ["White", "Black", "Silver", "Grey", "Red", "Blue", "Brown", "Gold"];
  const CAR_BRANDS = ["Maruti Suzuki", "Hyundai", "Tata", "Mahindra", "Honda", "Toyota", "Kia", "MG", "Renault", "Volkswagen", "Ford", "Skoda"];

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-white">
      <div className="w-full max-w-md space-y-6">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="h-14 w-14 rounded-2xl bg-emerald-600 flex items-center justify-center mx-auto shadow-xl mb-4">
            <Car size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">Driver Registration</h1>
          <p className="text-zinc-400 text-sm">Set up your driver profile to start earning</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 flex-1 p-2.5 rounded-xl text-xs font-bold transition-all ${step === 1 ? "bg-emerald-600 text-white" : "bg-emerald-950 text-emerald-400"}`}>
            <User size={14} />
            Personal Info
          </div>
          <div className="h-px w-4 bg-zinc-700" />
          <div className={`flex items-center gap-2 flex-1 p-2.5 rounded-xl text-xs font-bold transition-all ${step === 2 ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-500"}`}>
            <Truck size={14} />
            Vehicle Info
          </div>
        </div>

        {/* Step 1 — Personal Info */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Full Name</label>
              <div className="relative">
                <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  value={form.name}
                  onChange={e => update("name", e.target.value)}
                  placeholder="e.g. Ravi Kumar"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-10 pr-4 py-3.5 text-sm font-semibold focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Phone Number</label>
              <div className="relative">
                <Phone size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  value={form.phone}
                  onChange={e => update("phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="10-digit mobile number"
                  type="tel"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-10 pr-4 py-3.5 text-sm font-semibold focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            </div>

            {error && (
              <p className="text-red-400 text-xs font-semibold bg-red-950/40 border border-red-800/50 rounded-xl p-3">
                ⚠️ {error}
              </p>
            )}

            <button onClick={handleNext}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl transition-colors flex items-center justify-center gap-2">
              Next — Vehicle Details <ChevronRight size={16} />
            </button>

            <button onClick={onBack}
              className="w-full py-3 text-zinc-500 hover:text-zinc-300 font-bold text-sm transition-colors">
              ← Back to role select
            </button>
          </div>
        )}

        {/* Step 2 — Vehicle Info */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Car Brand</label>
              <div className="grid grid-cols-3 gap-2 col-gap-2 row-gap-2">
                {CAR_BRANDS.map(brand => (
                  <button key={brand} onClick={() => update("vehicleMake", brand)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${form.vehicleMake === brand
                      ? "bg-emerald-600 border-emerald-500 text-white"
                      : "bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-zinc-500"
                      }`}>
                    {brand}
                  </button>
                ))}
              </div>
              <input
                value={form.vehicleMake}
                onChange={e => update("vehicleMake", e.target.value)}
                placeholder="Or type your brand..."
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-emerald-500 transition-colors mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Model</label>
                <input
                  value={form.vehicleModel}
                  onChange={e => update("vehicleModel", e.target.value)}
                  placeholder="e.g. Swift, Creta"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-3 text-sm font-semibold focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Year</label>
                <input
                  value={form.vehicleYear}
                  onChange={e => update("vehicleYear", e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="2022"
                  type="number"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-3 text-sm font-semibold focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Car Color</label>
              <div className="flex gap-2 flex-wrap">
                {CAR_COLORS.map(color => (
                  <button key={color} onClick={() => update("vehicleColor", color)}
                    className={`py-1.5 px-3 rounded-lg text-xs font-bold border transition-all ${form.vehicleColor === color
                      ? "bg-emerald-600 border-emerald-500 text-white"
                      : "bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-zinc-500"
                      }`}>
                    {color}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Number Plate</label>
              <div className="relative">
                <Hash size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  value={form.plateNumber}
                  onChange={e => update("plateNumber", e.target.value.toUpperCase().slice(0, 12))}
                  placeholder="e.g. KA05AB1234"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-10 pr-4 py-3.5 text-sm font-black tracking-widest focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                Your Current Location
              </label>
              <div className="relative">
                <input
                  value={locationInput}
                  onChange={e => searchLocation(e.target.value)}
                  placeholder="Search your area e.g. Koramangala..."
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3.5 text-sm font-semibold text-white focus:outline-none focus:border-emerald-500"
                />
                {locationSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-zinc-800 border border-zinc-700 rounded-xl mt-1 z-50 overflow-hidden">
                    {locationSuggestions.map((s, i) => (
                      <button key={i} onClick={() => {
                        setLocationInput(s.address);
                        setChosenLocation({ lat: s.lat, lng: s.lng });
                        setLocationSuggestions([]);
                      }}
                        className="w-full text-left px-4 py-3 text-sm text-zinc-200 hover:bg-zinc-700 border-b border-zinc-700 last:border-0">
                        📍 {s.address}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={useGPS}
                className="w-full py-2.5 bg-zinc-800 border border-zinc-600 hover:border-emerald-500 text-white font-bold rounded-xl text-sm transition-all">
                📡 Use My GPS Instead
              </button>
              {chosenLocation && (
                <p className="text-emerald-400 text-xs font-semibold px-1">
                  ✅ Location set — you'll appear in rider searches
                </p>
              )}
            </div>

            {error && (
              <p className="text-red-400 text-xs font-semibold bg-red-950/40 border border-red-800/50 rounded-xl p-3">
                ⚠️ {error}
              </p>
            )}

            <button onClick={handleSubmit} disabled={loading}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black rounded-2xl transition-colors flex items-center justify-center gap-2">
              {loading ? (
                <><div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Registering...</>
              ) : (
                <><CheckCircle size={16} /> Complete Registration</>
              )}
            </button>

            <button onClick={() => { setStep(1); setError(""); }}
              className="w-full py-3 text-zinc-500 hover:text-zinc-300 font-bold text-sm transition-colors">
              ← Back to personal info
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
