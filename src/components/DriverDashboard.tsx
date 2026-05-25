import { useState, useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { Navigation, CheckCircle, XCircle, Car, Clock, Power, AlertCircle, Send, TrendingUp, ChevronDown, ChevronUp, DollarSign } from "lucide-react";
import MapComponent from "./MapComponent";
import { LatLng } from "../types";

const API_BASE = import.meta.env.VITE_API_URL || '';

const INDIA_CENTER = { lat: 12.9716, lng: 77.5946 }; // MG Road, Bengaluru

interface RideRequest {
  rideId: string;
  pickup: { address: string; lat: number; lng: number };
  drop: { address: string; lat: number; lng: number };
  fare: number;
  rideType: string;
  distanceKm: number;
  riderId: string;
}

interface DriverDashboardProps {
  driverInfo: { id: string; name: string; avatar: string };
  onSwitchRole: () => void;
}

export default function DriverDashboard({ driverInfo, onSwitchRole }: DriverDashboardProps) {
  const socketRef = useRef<Socket | null>(null);
  const watchRef = useRef<number | NodeJS.Timeout | null>(null);

  const [isOnline, setIsOnline] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<LatLng>(INDIA_CENTER);
  const [rideRequest, setRideRequest] = useState<RideRequest | null>(null);
  const [activeRide, setActiveRide] = useState<any | null>(null);
  const [earnings, setEarnings] = useState({ today: 0, total: 0, tips: 0 });
  const [tripCount, setTripCount] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [requestTimer, setRequestTimer] = useState<number>(30);
  const requestTimerRef = useRef<NodeJS.Timeout | null>(null);

  // OTP state (driver side)
  const [otpInput, setOtpInput] = useState("");
  const [otpError, setOtpError] = useState("");

  const [locationInput, setLocationInput] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState<any[]>([]);
  const [isSettingLocation, setIsSettingLocation] = useState(false);
  const [isLocationExpanded, setIsLocationExpanded] = useState(true);

  // Chat state
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  // Search location function
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

  // Set driver location and go available
  const setLocationAndGoOnline = async (place: any) => {
    setLocationInput(place.address);
    setLocationSuggestions([]);
    const loc = { lat: place.lat, lng: place.lng };
    setCurrentLocation(loc);

    // Save to DB + emit socket
    await fetch(`${API_BASE}/api/driver/location`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driverId: driverInfo.id, lat: loc.lat, lng: loc.lng })
    });

    setIsOnline(true);
    setIsLocationExpanded(false);
    socketRef.current?.emit("driver:register", driverInfo.id);
    showToast("You're now available for rides!");

    // Start GPS watch
    if (navigator.geolocation) {
      navigator.geolocation.watchPosition(pos => {
        const l = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCurrentLocation(l);
        socketRef.current?.emit("driver:location_update", {
          driverId: driverInfo.id, lat: l.lat, lng: l.lng, bearing: 0
        });
      }, () => simulateBangaloreMovement(), { enableHighAccuracy: true });
    }
  };

  // Use GPS directly
  const useGPSLocation = () => {
    if (!navigator.geolocation) { showToast("GPS not available"); return; }
    setIsSettingLocation(true);
    navigator.geolocation.getCurrentPosition(async pos => {
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setCurrentLocation(loc);
      // Reverse geocode
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${loc.lat}&lon=${loc.lng}`);
        const data = await res.json();
        setLocationInput(data.display_name?.split(",").slice(0, 2).join(", ") || "Current Location");
      } catch { setLocationInput("Current Location"); }
      await fetch(`${API_BASE}/api/driver/location`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId: driverInfo.id, lat: loc.lat, lng: loc.lng })
      });
      setIsOnline(true);
      setIsLocationExpanded(false);
      socketRef.current?.emit("driver:register", driverInfo.id);
      showToast("You're now available!");
      setIsSettingLocation(false);
    }, () => { showToast("GPS failed, enter location manually"); setIsSettingLocation(false); });
  };

  // Connect socket on mount
  useEffect(() => {
    const socket = io(import.meta.env.VITE_API_URL || window.location.origin);
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[Driver] Socket connected:", socket.id);
    });

    // Load persisted driver data from DB
    fetch(`${API_BASE}/api/driver/${driverInfo.id}`)
      .then(r => r.json())
      .then(data => {
        if (data.driver) {
          setEarnings({
            today: data.driver.earnings?.today || 0,
            total: data.driver.earnings?.total || 0,
            tips: data.driver.earnings?.tips || 0
          });
          setIsOnline(data.driver.isOnline || false); // Set initial online status from DB
          // CRITICAL: Re-register the current socket with the backend if we are already online
          if (data.driver.isOnline) {
            socket.emit("driver:register", driverInfo.id);
          }
          setTripCount(data.driver.totalRides || 0);
        }
      })
      .catch(() => { });

    // New ride request broadcast
    socket.on("driver:new_ride_request", (request: RideRequest) => {
      setRideRequest(request);
      setRequestTimer(30);
      if (requestTimerRef.current) clearInterval(requestTimerRef.current);
      requestTimerRef.current = setInterval(() => {
        setRequestTimer(prev => {
          if (prev <= 1) {
            clearInterval(requestTimerRef.current!);
            setRideRequest(null);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    });

    // Driver confirmed for a ride
    socket.on("driver:ride_confirmed", (data: { ride: any }) => {
      setActiveRide(data.ride);
      setRideRequest(null);
      if (requestTimerRef.current) clearInterval(requestTimerRef.current);
      showToast("Ride confirmed! Head to pickup point.");
    });

    // Trip started after OTP
    socket.on("driver:trip_started", (data: { ride: any }) => {
      setActiveRide(data.ride);
      showToast("Trip started! Navigate to drop-off.");
    });

    // Trip completed
    socket.on("driver:trip_completed", (data: { rideId: string; earnings: number }) => {
      setEarnings(prev => ({ ...prev, today: prev.today + data.earnings, total: prev.total + data.earnings }));
      setTripCount(prev => prev + 1);
      setActiveRide(null);
      showToast(`Trip done! +₹${data.earnings} earned.`);
    });

    socket.on("driver:tip_received", (data: { tip: number }) => {
      setEarnings(prev => ({
        ...prev,
        today: prev.today + data.tip,
        total: prev.total + data.tip,
        tips: prev.tips + data.tip
      }));
      showToast(`💰 ₹${data.tip} tip received!`);
    });

    // Rider cancelled
    socket.on("driver:ride_cancelled", () => {
      setActiveRide(null);
      setRideRequest(null);
      showToast("Rider cancelled the trip.");
    });

    return () => {
      socket.disconnect();
      if (requestTimerRef.current) clearInterval(requestTimerRef.current);
    };
  }, []);

  // Go online — register with server + start GPS tracking
  const goOnline = () => {
    setIsOnline(true);
    setIsLocationExpanded(false);
    socketRef.current?.emit("driver:register", driverInfo.id);
    showToast("You are now online. Waiting for ride requests...");

    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setCurrentLocation(loc);
          socketRef.current?.emit("driver:location_update", {
            driverId: driverInfo.id,
            lat: loc.lat,
            lng: loc.lng,
            bearing: 0,
          });
        },
        () => {
          // GPS not available — use simulated Bangalore movement
          simulateBangaloreMovement();
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
      watchRef.current = watchId;
    } else {
      simulateBangaloreMovement();
    }
  };

  const goOffline = () => {
    setIsOnline(false);
    if (watchRef.current !== null) {
      if (typeof watchRef.current === "number") {
        navigator.geolocation.clearWatch(watchRef.current);
      } else {
        clearInterval(watchRef.current);
      }
      watchRef.current = null;
    }
    showToast("You are now offline.");
  };

  // Simulated GPS movement around Bangalore for demo/desktop
  const simulateBangaloreMovement = () => {
    let lat = INDIA_CENTER.lat + (Math.random() - 0.5) * 0.02;
    let lng = INDIA_CENTER.lng + (Math.random() - 0.5) * 0.02;
    setCurrentLocation({ lat, lng });
    const interval = setInterval(() => {
      lat += (Math.random() - 0.5) * 0.0005;
      lng += (Math.random() - 0.5) * 0.0005;
      setCurrentLocation({ lat, lng });
      socketRef.current?.emit("driver:location_update", {
        driverId: driverInfo.id,
        lat,
        lng,
        bearing: Math.random() * 360,
      });
    }, 3000);
    watchRef.current = interval;
  };

  // Poll chat messages when there's an active ride
  useEffect(() => {
    if (!activeRide?.id) return;
    const load = async () => {
      const res = await fetch(`${API_BASE}/api/chat?rideId=${activeRide.id}`);
      if (res.ok) { const d = await res.json(); setChatMessages(d.messages || []); }
    };
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [activeRide?.id]);

  useEffect(() => {
    if (!isOnline || !activeRide) return;

    const interval = setInterval(() => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setCurrentLocation(loc);
          socketRef.current?.emit("driver:location_update", {
            driverId: driverInfo.id,
            lat: loc.lat,
            lng: loc.lng,
            bearing: 0
          });
        });
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isOnline, activeRide?.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const sendDriverChat = async () => {
    if (!chatInput.trim() || !activeRide) return;
    const msg = chatInput.trim();
    setChatInput("");
    await fetch(`${API_BASE}/api/driver/chat/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rideId: activeRide.id, content: msg, driverName: driverInfo.name })
    });
    const res = await fetch(`${API_BASE}/api/chat?rideId=${activeRide.id}`);
    if (res.ok) { const d = await res.json(); setChatMessages(d.messages || []); }
  };

  const verifyOTP = async () => {
    if (!otpInput.trim() || !activeRide) return;
    try {
      const res = await fetch(`${API_BASE}/api/rides/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rideId: activeRide.id, otp: otpInput.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setOtpError("");
        setOtpInput("");
        setActiveRide(data.ride);
        showToast("OTP verified! Trip started.");
      } else {
        setOtpError("Wrong OTP. Ask rider again.");
      }
    } catch {
      setOtpError("Network error. Try again.");
    }
  };

  const acceptRide = () => {
    if (!rideRequest) return;
    if (requestTimerRef.current) clearInterval(requestTimerRef.current);
    socketRef.current?.emit("driver:accept_ride", {
      driverId: driverInfo.id,
      rideId: rideRequest.rideId,
    });
    setRideRequest(null);
  };

  const rejectRide = () => {
    if (!rideRequest) return;
    if (requestTimerRef.current) clearInterval(requestTimerRef.current);
    socketRef.current?.emit("driver:reject_ride", {
      driverId: driverInfo.id,
      rideId: rideRequest.rideId
    });
    setRideRequest(null);
    showToast("Ride rejected.");
  };

  const markArrived = () => {
    if (!activeRide) return;
    socketRef.current?.emit("driver:arrived", { rideId: activeRide.id });
    setActiveRide({ ...activeRide, status: "arrived" });
  };

  const completeTrip = () => {
    if (!activeRide) return;
    socketRef.current?.emit("driver:complete_trip", { rideId: activeRide.id });
  };

  const cancelActiveTrip = () => {
    if (!activeRide) return;
    socketRef.current?.emit("driver:cancel_ride", { rideId: activeRide.id });
    setActiveRide(null);
    showToast("You cancelled the trip.");
  };

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-white font-sans">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] bg-emerald-600 text-white px-6 py-3 rounded-xl shadow-2xl text-sm font-semibold animate-bounce">
          {toast}
        </div>
      )}

      {/* Header */}
      <nav className="bg-zinc-955 border-b border-zinc-900 px-4 h-[52px] flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-emerald-600/10 border border-emerald-500/20 flex items-center justify-center shadow-inner shadow-emerald-500/10">
            <Car size={16} className="text-emerald-500" />
          </div>
          <div className="min-w-0">
            <p className="font-black text-xs text-white uppercase tracking-wider leading-none">Driver Hub</p>
            <p className="text-zinc-500 text-[10px] truncate leading-none mt-1">{driverInfo.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onSwitchRole}
            className="text-zinc-400 hover:text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg hover:bg-zinc-900 transition-colors cursor-pointer border border-transparent hover:border-zinc-800"
          >
            Switch to Rider
          </button>
          <button
            onClick={async () => {
              // 1. Set driver offline in MongoDB
              await fetch(`${API_BASE}/api/driver/offline`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ driverId: driverInfo.id })
              });
              // 2. Disconnect socket
              socketRef.current?.disconnect();
              // 3. Go back to role select
              onSwitchRole();
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-900 hover:bg-red-955/30 border border-zinc-850 hover:border-red-900/30 text-zinc-400 hover:text-red-400 font-bold text-[11px] rounded-lg transition-all cursor-pointer"
          >
            <Power size={11} /> Logout
          </button>
        </div>
      </nav>

      <div className="flex flex-1 flex-col md:flex-row h-[calc(100vh-52px)] overflow-hidden">
        {/* Left Panel */}
        <div className="w-full md:w-[380px] bg-zinc-950 flex flex-col h-[45vh] md:h-full overflow-y-auto border-r border-zinc-900">

          {/* Collapsible Location Configuration / Availability Panel */}
          <div className="border-b border-zinc-900 bg-zinc-900/20">
            <button
              onClick={() => setIsLocationExpanded(prev => !prev)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-900/40 transition-all text-left animate-fadeIn"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative flex items-center justify-center shrink-0">
                  <div className={`h-2.5 w-2.5 rounded-full ${isOnline ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-wider text-white">
                    {isOnline ? "ONLINE" : "OFFLINE"}
                  </p>
                  <p className="text-zinc-500 text-[10px] font-semibold truncate max-w-[200px] mt-0.5">
                    {isOnline ? (locationInput || "Location set") : "Tap to set location"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isOnline && (
                  <span className="text-[8px] bg-emerald-955/60 text-emerald-400 border border-emerald-900/50 px-2 py-0.5 rounded-full font-black tracking-wider">
                    ACTIVE
                  </span>
                )}
                {isLocationExpanded ? <ChevronUp size={14} className="text-zinc-400" /> : <ChevronDown size={14} className="text-zinc-400" />}
              </div>
            </button>

            {/* Accordion Content */}
            {isLocationExpanded && (
              <div className="px-4 pb-4 pt-1 space-y-3 border-t border-zinc-900/50 bg-zinc-900/10">
                {!isOnline ? (
                  <div className="space-y-3">
                    <p className="text-zinc-500 text-[11px] font-medium">Set your location to start receiving ride requests:</p>

                    {/* Location search input */}
                    <div className="relative">
                      <input
                        value={locationInput}
                        onChange={e => searchLocation(e.target.value)}
                        placeholder="Enter your current location..."
                        className="w-full bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl px-3.5 py-3 text-xs font-semibold text-white focus:outline-none focus:border-emerald-500 transition-all placeholder-zinc-500"
                      />
                      {locationSuggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 bg-zinc-900 border border-zinc-850 rounded-xl mt-1.5 z-[99] overflow-hidden shadow-2xl">
                          {locationSuggestions.map((s, i) => (
                            <button key={i} onClick={() => {
                              setLocationAndGoOnline(s);
                            }}
                              className="w-full text-left px-3.5 py-2.5 text-xs text-zinc-200 hover:bg-zinc-800 border-b border-zinc-800 last:border-0 font-medium font-sans">
                              📍 {s.address}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Use GPS button */}
                    <button
                      onClick={useGPSLocation}
                      disabled={isSettingLocation}
                      className="w-full py-2.5 bg-zinc-900 border border-zinc-800 hover:border-emerald-500/40 hover:bg-emerald-955/10 text-zinc-300 hover:text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isSettingLocation ? (
                        <div className="h-3.5 w-3.5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Navigation size={12} className="text-zinc-400" />
                      )}
                      {isSettingLocation ? "Getting GPS..." : "Use My GPS Location"}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 pt-2">
                    <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-xl text-[10px] text-zinc-400 flex flex-col gap-1">
                      <div className="flex justify-between">
                        <span className="font-bold text-zinc-500">CURRENT POSITION:</span>
                        <span className="text-emerald-400 font-black">ACTIVE GPS</span>
                      </div>
                      <p className="font-semibold text-zinc-300 truncate">{locationInput || "Live Coordinates"}</p>
                    </div>

                    <button
                      onClick={() => {
                        setIsOnline(false);
                        setLocationInput("");
                        // Call backend API to set driver offline
                        fetch(`${API_BASE}/api/driver/offline`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ driverId: driverInfo.id })
                        });
                        // No need to disconnect socket here, as the driver might still be active in the app
                        // The disconnect event handler in server.ts will catch actual socket disconnections.
                        showToast("You're now offline");
                        setIsLocationExpanded(false);
                      }}
                      className="w-full py-2.5 bg-red-955/20 border border-red-900/30 hover:bg-red-900/20 text-red-400 hover:text-red-300 font-bold text-xs rounded-xl transition-all cursor-pointer"
                    >
                      Go Offline
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Stats Grid */}
          <div className="p-4 grid grid-cols-4 gap-1.5 border-b border-zinc-900">
            {/* Today's Earnings Card */}
            <div className="bg-zinc-900/30 border border-zinc-900 hover:border-emerald-500/20 rounded-xl p-2.5 flex flex-col justify-between transition-all duration-200">
              <div className="flex items-center justify-between text-zinc-500">
                <p className="text-[9px] font-bold uppercase tracking-wider">Today</p>
                <DollarSign size={11} className="text-emerald-500" />
              </div>
              <p className="text-sm font-black text-emerald-400 mt-1">₹{earnings.today}</p>
            </div>

            {/* Trips Card */}
            <div className="bg-zinc-900/30 border border-zinc-900 hover:border-blue-500/20 rounded-xl p-2.5 flex flex-col justify-between transition-all duration-200">
              <div className="flex items-center justify-between text-zinc-500">
                <p className="text-[9px] font-bold uppercase tracking-wider">Trips</p>
                <Car size={11} className="text-blue-500" />
              </div>
              <p className="text-sm font-black text-zinc-100 mt-1">{tripCount}</p>
            </div>

            {/* Total Earnings Card */}
            <div className="bg-zinc-900/30 border border-zinc-900 hover:border-zinc-800 rounded-xl p-2.5 flex flex-col justify-between transition-all duration-200">
              <div className="flex items-center justify-between text-zinc-500">
                <p className="text-[9px] font-bold uppercase tracking-wider">Total</p>
                <TrendingUp size={11} className="text-zinc-400" />
              </div>
              <p className="text-sm font-black text-zinc-200 mt-1">₹{earnings.total}</p>
            </div>

            {/* Tips Card */}
            <div className="bg-zinc-900/30 border border-zinc-900 hover:border-amber-500/20 rounded-xl p-2.5 flex flex-col justify-between transition-all duration-200">
              <div className="flex items-center justify-between text-zinc-500">
                <p className="text-[9px] font-bold uppercase tracking-wider">Tips</p>
                <DollarSign size={11} className="text-amber-500" />
              </div>
              <p className="text-sm font-black text-amber-400 mt-1">₹{earnings.tips}</p>
            </div>
          </div>

          {/* Active Ride Info */}
          {activeRide && !rideRequest && (
            <div className="p-4 space-y-4 border-b border-zinc-900">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-zinc-400 text-[10px] uppercase tracking-wider">Active Trip</h3>
                <span
                  className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider border ${activeRide.status === "accepted"
                    ? "bg-blue-955/60 text-blue-400 border-blue-900/50"
                    : activeRide.status === "arrived"
                      ? "bg-amber-955/60 text-amber-400 border-amber-900/50"
                      : activeRide.status === "in_progress"
                        ? "bg-emerald-955/60 text-emerald-400 border-emerald-900/50"
                        : "bg-zinc-900 text-zinc-500 border-zinc-805"
                    }`}
                >
                  {activeRide.status === "accepted"
                    ? "Head to pickup"
                    : activeRide.status === "arrived"
                      ? "Waiting for rider"
                      : activeRide.status === "in_progress"
                        ? "Trip in progress"
                        : activeRide.status}
                </span>
              </div>

              <div className="space-y-3 bg-zinc-900/40 border border-zinc-900 p-3.5 rounded-xl relative">
                <div className="absolute left-[19px] top-[24px] bottom-[24px] w-px border-l border-dashed border-zinc-800" />

                <div className="flex items-start gap-2.5 relative z-10">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 border border-zinc-950 mt-1 shrink-0" />
                  <p className="text-xs font-semibold text-zinc-300 leading-tight">
                    {activeRide.pickup.address}
                  </p>
                </div>
                <div className="flex items-start gap-2.5 relative z-10">
                  <div className="h-2 w-2 rounded bg-red-500 border border-zinc-950 mt-1 shrink-0" />
                  <p className="text-xs font-semibold text-zinc-300 leading-tight">
                    {activeRide.drop.address}
                  </p>
                </div>
              </div>

              <div className="flex justify-between items-center bg-zinc-900/10 border border-zinc-900 px-3.5 py-2.5 rounded-xl">
                <div>
                  <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Distance</p>
                  <p className="text-xs font-black text-zinc-200 mt-0.5">{activeRide.distanceKm} km</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Fare Payout</p>
                  <p className="text-base font-black text-emerald-400 mt-0.5">₹{activeRide.fare}</p>
                </div>
              </div>

              {activeRide.status === "accepted" && (
                <div className="space-y-2.5">
                  <div className="p-3 bg-blue-955/10 border border-blue-900/20 rounded-xl text-[11px] font-medium text-blue-400 flex items-start gap-2">
                    <Navigation size={12} className="mt-0.5 shrink-0" />
                    <span>Navigate to pickup point on the map.</span>
                  </div>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${activeRide.pickup.lat},${activeRide.pickup.lng}&travelmode=driving`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-zinc-200 hover:text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Navigation size={12} /> Open Google Maps
                  </a>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      onClick={cancelActiveTrip}
                      className="py-3 rounded-xl bg-zinc-955 border border-zinc-900 hover:bg-red-955/20 hover:border-red-900/30 text-zinc-400 hover:text-red-400 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={markArrived}
                      className="py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-blue-955/30 transition-all cursor-pointer"
                    >
                      I've Arrived
                    </button>
                  </div>
                </div>
              )}

              {activeRide.status === "arrived" && (
                <div className="space-y-3">
                  <div className="p-3.5 bg-zinc-955 border border-zinc-900 rounded-xl text-center">
                    <p className="text-zinc-500 text-[10px] font-black uppercase tracking-wider mb-1">Verify Trip Start</p>
                    <p className="text-zinc-300 font-semibold text-xs leading-normal">Enter the 6-digit OTP shown on the rider's screen</p>
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={otpInput}
                      onChange={e => setOtpInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="Enter OTP"
                      className="flex-1 bg-zinc-955 border border-zinc-900 rounded-xl px-4 py-3 text-white font-black text-center text-lg tracking-widest focus:outline-none focus:border-emerald-500 transition-all"
                    />
                    <button
                      onClick={verifyOTP}
                      className="px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
                    >
                      Verify
                    </button>
                  </div>
                  {otpError && (
                    <p className="text-red-400 text-xs font-semibold text-center">{otpError}</p>
                  )}
                  <button
                    onClick={cancelActiveTrip}
                    className="w-full py-2.5 bg-zinc-950 border border-zinc-900 hover:bg-red-955/20 hover:border-red-900/30 text-zinc-400 hover:text-red-400 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
                  >
                    Cancel Trip
                  </button>
                </div>
              )}

              {activeRide.status === "in_progress" && (
                <div className="space-y-2.5">
                  <div className="p-3 bg-emerald-955/10 border border-emerald-900/20 rounded-xl text-[11px] font-medium text-emerald-400 flex items-start gap-2">
                    <Navigation size={12} className="mt-0.5 shrink-0 animate-pulse" />
                    <span>En route to drop-off point. Drive safely!</span>
                  </div>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${activeRide.drop.lat},${activeRide.drop.lng}&travelmode=driving`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-zinc-200 hover:text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Navigation size={12} /> Navigate to Drop
                  </a>
                  <button
                    onClick={completeTrip}
                    className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-955/30 transition-all cursor-pointer"
                  >
                    Complete Trip
                  </button>
                </div>
              )}

              {/* Chat panel — shown during active trip (not just accepted) */}
              {activeRide.status !== "accepted" && (
                <div className="border border-zinc-900 rounded-xl overflow-hidden bg-zinc-900/10">
                  <button onClick={() => setIsChatOpen(v => !v)}
                    className="w-full p-3 flex items-center justify-between bg-zinc-900/40 hover:bg-zinc-850/50 transition-all text-left">
                    <span className="text-xs font-bold text-zinc-300 flex items-center gap-2">
                      💬 Chat with rider
                      {chatMessages.filter((m: any) => m.senderId === "rider").length > 0 && (
                        <span className="bg-blue-600 text-white text-[9px] px-1.5 py-0.5 rounded-full font-black">
                          {chatMessages.filter((m: any) => m.senderId === "rider").length}
                        </span>
                      )}
                    </span>
                    <span className="text-zinc-500 text-[10px]">{isChatOpen ? "▲" : "▼"}</span>
                  </button>
                  {isChatOpen && (
                    <div className="flex flex-col bg-zinc-955/40 border-t border-zinc-900/50">
                      <div className="h-32 overflow-y-auto p-3 space-y-2">
                        {chatMessages.length === 0 ? (
                          <p className="text-zinc-600 text-xs text-center py-4">No messages yet</p>
                        ) : chatMessages.map((m: any) => (
                          <div key={m.id} className={`flex ${m.senderId === "driver" ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[80%] px-3 py-2 rounded-xl text-xs ${m.senderId === "driver" ? "bg-emerald-700 text-white rounded-br-none" :
                              m.senderId === "system" ? "bg-zinc-900 text-zinc-500 border border-zinc-800 text-center w-full rounded-xl" :
                                "bg-zinc-800 text-zinc-300 rounded-bl-none"
                              }`}>
                              {m.content}
                            </div>
                          </div>
                        ))}
                        <div ref={chatEndRef} />
                      </div>
                      <div className="flex gap-1.5 p-2 border-t border-zinc-900/50 bg-zinc-900/20">
                        <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && sendDriverChat()}
                          placeholder="Message rider..."
                          className="flex-1 bg-zinc-955 border border-zinc-900 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-zinc-800 placeholder-zinc-600" />
                        <button onClick={sendDriverChat}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors text-xs font-bold flex items-center gap-1 cursor-pointer">
                          <Send size={11} /> Send
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Idle state */}
          {!rideRequest && !activeRide && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
              {isOnline ? (
                <>
                  <div className="h-14 w-14 rounded-full bg-emerald-955/40 border border-emerald-800/40 flex items-center justify-center shadow-lg shadow-emerald-955/20">
                    <Car size={24} className="text-emerald-500 animate-pulse" />
                  </div>
                  <div>
                    <p className="font-black text-sm text-zinc-200 uppercase tracking-wider">Waiting for requests</p>
                    <p className="text-zinc-500 text-xs font-medium mt-1">
                      Keep your app open. Matches will slide in here.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="h-14 w-14 rounded-full bg-zinc-900 border border-zinc-850 flex items-center justify-center">
                    <Power size={24} className="text-zinc-500" />
                  </div>
                  <div>
                    <p className="font-black text-sm text-zinc-400 uppercase tracking-wider">You're offline</p>
                    <p className="text-zinc-600 text-xs font-medium mt-1">
                      Expand the status panel above to go online.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setIsLocationExpanded(true);
                      goOnline();
                    }}
                    className="mt-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 rounded-xl font-bold text-xs uppercase tracking-wider text-white transition-colors cursor-pointer"
                  >
                    Go Online
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Map — shows driver's current location and active ride route */}
        <div className="flex-1 h-[55vh] md:h-full relative">
          <MapComponent
            pickup={activeRide ? activeRide.pickup : currentLocation}
            drop={activeRide ? activeRide.drop : null}
            route={activeRide?.route || []}
            driver={null}
            userLocation={currentLocation}
            weatherCondition="Clear"
          />
        </div>
      </div>

      {/* Sliding Sheet for Incoming Ride Requests */}
      {isOnline && (
        <div
          className={`fixed bottom-0 left-0 right-0 md:left-4 md:right-auto md:bottom-4 md:w-[360px] z-[999] bg-zinc-950/95 backdrop-blur-xl border border-zinc-800 md:rounded-2xl rounded-t-3xl shadow-2xl transition-all duration-500 ease-out transform ${rideRequest
            ? "translate-y-0 opacity-100"
            : "translate-y-full opacity-0 pointer-events-none"
            }`}
        >
          {rideRequest && (
            <div className="p-5 space-y-4">
              {/* Header with timer */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                  <span className="font-black text-xs text-amber-500 uppercase tracking-widest">
                    New Ride Request
                  </span>
                </div>
                <div className="flex items-center gap-1.5 bg-amber-955/40 border border-amber-900/40 rounded-full px-3 py-1">
                  <Clock size={12} className="text-amber-400" />
                  <span className="font-mono font-black text-amber-400 text-xs">
                    {requestTimer}s
                  </span>
                </div>
              </div>

              {/* Progress Bar Timer */}
              <div className="h-1 bg-zinc-800 rounded-full overflow-hidden w-full">
                <div
                  className="h-full bg-amber-500 transition-all duration-1000 ease-linear"
                  style={{ width: `${(requestTimer / 30) * 100}%` }}
                />
              </div>

              {/* Locations details */}
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 space-y-4 relative">
                {/* Visual dotted connection line */}
                <div className="absolute left-[21px] top-[28px] bottom-[28px] w-px border-l border-dashed border-zinc-700" />

                <div className="flex items-start gap-3 relative z-10">
                  <div className="h-3 w-3 rounded-full bg-emerald-500 border-2 border-zinc-955 mt-1 shrink-0 flex items-center justify-center">
                    <div className="h-1 w-1 rounded-full bg-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Pickup Point</p>
                    <p className="text-xs font-semibold text-zinc-200 mt-0.5 leading-normal">{rideRequest.pickup.address}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 relative z-10">
                  <div className="h-3 w-3 rounded bg-red-500 border border-zinc-955 mt-1 shrink-0 flex items-center justify-center">
                    <div className="h-1 w-1 rounded bg-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Drop-off Destination</p>
                    <p className="text-xs font-semibold text-zinc-200 mt-0.5 leading-normal">{rideRequest.drop.address}</p>
                  </div>
                </div>
              </div>

              {/* Price and distance info */}
              <div className="flex items-center justify-between px-1">
                <div className="text-left">
                  <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Ride Details</p>
                  <p className="text-xs font-black text-zinc-300 mt-0.5">
                    {rideRequest.distanceKm} km • {rideRequest.rideType}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Est. Payout</p>
                  <p className="text-xl font-black text-emerald-400 mt-0.5">₹{rideRequest.fare}</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  onClick={rejectRide}
                  className="py-3 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-red-955/20 hover:border-red-900/30 text-zinc-400 hover:text-red-400 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <XCircle size={14} /> Reject
                </button>
                <button
                  onClick={acceptRide}
                  className="py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-955/30 transition-all cursor-pointer"
                >
                  <CheckCircle size={14} /> Accept Request
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
