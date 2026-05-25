import React, { useState, useEffect, useRef } from "react";
import { Car, MapPin, Navigation, Star, MessageSquare, ChevronRight, Send, Wallet as WalletIcon, ShieldAlert, Trash2, X, Home, Activity, User } from "lucide-react";
import { SignedIn, SignedOut, SignInButton, UserButton, useUser, useClerk } from "@clerk/clerk-react";
import { io, type Socket } from "socket.io-client";
import CustomSignIn from "./components/CustomSignIn";
import MapComponent from "./components/MapComponent";
import DriverDashboard from "./components/DriverDashboard";
import DriverRegistration from "./components/DriverRegistration";
import { LatLng, Driver, Ride, Message, User as GitaUser, WalletTransaction, PromoCode } from "./types";

const API_BASE = import.meta.env.VITE_API_URL || '';

const INDIA_CENTER = { lat: 12.9716, lng: 77.5946 };

export default function App() {
  const { isSignedIn: clerkSignedIn, isLoaded: clerkLoaded, user: clerkUser } = useUser();
  const [isDemoBypass, setIsDemoBypass] = useState(() => sessionStorage.getItem("demo_bypass") === "true");

  const [userRole, setUserRole] = useState<"rider" | "driver" | null>(() => {
    const saved = localStorage.getItem("user_role");
    const pending = localStorage.getItem("pending_role");
    if (saved === "rider" || saved === "driver") return saved;
    if (pending === "rider" || pending === "driver") return pending;
    return null;
  });

  const isAuthenticated = (clerkSignedIn || isDemoBypass) && userRole !== null;

  const [activeTab, setActiveTab] = useState<"home" | "activity" | "profile" | "daily_ride" | "ubershared" | "reserve" | "package" | "rentals" | "intercity">("home");

  const [pickup, setPickup] = useState<LatLng | null>(null);
  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupQuery, setPickupQuery] = useState("");
  const [pickupSuggestions, setPickupSuggestions] = useState<any[]>([]);
  const [pickupConfirmed, setPickupConfirmed] = useState(false);
  const pickupGeocodeRef = useRef<NodeJS.Timeout | null>(null);
  const [drop, setDrop] = useState<LatLng | null>(null);
  const [dropAddress, setDropAddress] = useState("");
  const [dropQuery, setDropQuery] = useState("");
  const [searchSuggestions, setSearchSuggestions] = useState<any[]>([]);

  const [rideEstimates, setRideEstimates] = useState<any[]>([]);
  const [selectedEstimateId, setSelectedEstimateId] = useState<string>("");
  const [distanceKm, setDistanceKm] = useState<number>(0);
  const [durationMin, setDurationMin] = useState<number>(0);
  const [previewRoute, setPreviewRoute] = useState<any[]>([]);

  // Driver Marketplace state
  const [nearbyDrivers, setNearbyDrivers] = useState<any[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>("");
  const [driverRejected, setDriverRejected] = useState(false);

  // Keep ref to avoid socket stale closures
  const pickupRef = useRef<LatLng | null>(null);
  useEffect(() => {
    pickupRef.current = pickup;
  }, [pickup]);

  const [activeRide, setActiveRide] = useState<Ride | null>(null);
  const [rideHistory, setRideHistory] = useState<Ride[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [otpValueInput, setOtpValueInput] = useState("");
  const [otpVerifyError, setOtpVerifyError] = useState("");

  const [user, setUser] = useState<GitaUser | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"success" | "error" | "info" | "sos">("info");
  const [sosActive, setSosActive] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);

  const [activeDriver, setActiveDriver] = useState<Driver | null>(null);
  const [driverProfile, setDriverProfile] = useState<any>(null);
  const [checkingDriverProfile, setCheckingDriverProfile] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [activeDriverLocation, setActiveDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [liveLocation, setLiveLocation] = useState<any>(null);
  const socketRef = useRef<Socket | null>(null);
  const autoGeocodeRef = useRef<NodeJS.Timeout | null>(null);

  function showToast(msg: string, type: "success" | "error" | "info" | "sos" = "info") {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => { setToastMessage(null); }, 4500);
  }

  const fetchNearbyDrivers = async (pickupCoords: any, rideTypeVal: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/drivers/nearby`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickup: pickupCoords, rideType: rideTypeVal })
      });
      if (res.ok) {
        const data = await res.json();
        setNearbyDrivers(data.drivers || []);
        if (data.drivers?.length > 0) setSelectedDriverId(data.drivers[0].id);
      }
    } catch { }
  };

  const fetchData = async (skipRideSync = false) => {
    if (document.hidden) return;
    try {
      const uRes = await fetch(`${API_BASE}/api/user`);
      if (uRes.ok) { const uData = await uRes.json(); setUser(uData.user); }

      if (!skipRideSync) {
        const actRes = await fetch(`${API_BASE}/api/rides/active`);
        if (actRes.ok) { const actData = await actRes.json(); setActiveRide(actData.ride); setActiveDriver(actData.driver); }
      }

      const histRes = await fetch(`${API_BASE}/api/history`);
      if (histRes.ok) { const histData = await histRes.json(); setRideHistory(histData.history || []); }

      const walletRes = await fetch(`${API_BASE}/api/user/wallet`);
      if (walletRes.ok) { const walletData = await walletRes.json(); setTransactions(walletData.transactions || []); }
    } catch (e) {
      console.error('[fetchData] API error:', e);
    } finally {
      // always runs — ensures no spinner stays stuck if called with a loading gate
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    // Safety: always unblock spinner after 3 seconds even if API is unreachable
    const safetyTimer = setTimeout(() => setDataLoaded(true), 3000);

    const load = async () => {
      try {
        if (clerkUser) {
          // Sync Clerk user with backend first, then fetch app data
          await fetch(`${API_BASE}/api/user`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: clerkUser.id,
              name: clerkUser.fullName || clerkUser.firstName || "User",
              email: clerkUser.primaryEmailAddress?.emailAddress || "",
              avatar: clerkUser.imageUrl || ""
            })
          });
        }
        await fetchData();
      } catch (e) {
        console.error('[App] Initial load error:', e);
      } finally {
        setDataLoaded(true);   // always runs — clears spinner even on failure
        clearTimeout(safetyTimer);
      }
    };

    load();
    return () => clearTimeout(safetyTimer);
  }, [isAuthenticated, clerkUser]);

  useEffect(() => {
    if (userRole !== "driver") return;
    if (!isAuthenticated) return;

    const userId = clerkUser?.id || user?.id;
    if (!userId) return;

    // Always fetch fresh from MongoDB on every role switch
    setCheckingDriverProfile(true);
    setDriverProfile(null); // clear stale state first

    fetch(`${API_BASE}/api/driver/profile/${userId}`)
      .then(r => r.json())
      .then(data => {
        if (data.exists && data.driver) {
          setDriverProfile(data.driver); // existing driver → go to dashboard
        }
        // else stays null → registration form shows
      })
      .catch(() => {
        // network error → show registration form
      })
      .finally(() => {
        setCheckingDriverProfile(false);
      });
  }, [userRole]); // ONLY userRole — re-runs every time they switch to driver

  useEffect(() => {
    if (isAuthenticated && userRole === "rider") {
      setPickup(INDIA_CENTER);

      const socket = io(import.meta.env.VITE_API_URL || window.location.origin);
      socketRef.current = socket;

      socket.on("ride:status_update", ({ ride, driver, message }) => {
        if (ride.status === "completed") {
          // Show rating sheet — do NOT set activeRide (let rating submission clear it)
          setLastCompletedRideId(ride.id);
          setShowRatingSheet(true);
          if (message) showToast(message, "success");
          else showToast("Ride completed! Please rate your experience.", "success");
          return;
        }
        setActiveRide(ride);
        if (driver !== undefined) setActiveDriver(driver);
        if (message) showToast(message, "info");
        else showToast(`Ride status: ${ride.status.replace("_", " ")}`, "info");
      });

      socket.on("ride:location_update", ({ lat, lng, bearing }) => {
        setActiveDriver(prev => prev ? { ...prev, currentLocation: { lat, lng }, bearing } : null);
      });

      socket.on("chat:message", (msg) => {
        setMessages(prev => [...prev, msg]);
      });

      socket.on("ride:driver_rejected", ({ message }) => {
        setDriverRejected(true);
        setActiveRide(null);
        showToast(message, "error");
        // Re-fetch nearby drivers so rider can pick another
        if (pickupRef.current) fetchNearbyDrivers(pickupRef.current, "economy");
      });

      return () => { socket.disconnect(); };
    }
  }, [isAuthenticated, userRole]);

  useEffect(() => {
    if (activeRide && socketRef.current) {
      socketRef.current.emit("rider:join_ride", activeRide.id);
    }
  }, [activeRide?.id]);

  // Poll driver live location while ride is accepted (driver en route to pickup)
  useEffect(() => {
    if (!activeRide?.id || activeRide.status !== "accepted" || !activeRide.driverId) return;
    setActiveDriverLocation(null);
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/driver/location/${activeRide.driverId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.location) setActiveDriverLocation(data.location);
        }
      } catch { }
    }, 3000);
    return () => clearInterval(interval);
  }, [activeRide?.id, activeRide?.status, activeRide?.driverId]);

  // Clear driver location marker when trip starts or ends
  useEffect(() => {
    if (activeRide?.status === "in_progress" || activeRide?.status === "completed" || !activeRide) {
      setActiveDriverLocation(null);
    }
  }, [activeRide?.status]);

  useEffect(() => {
    if (!activeRide || activeRide.status === "completed") return;
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLiveLocation(loc);
      },
      () => { },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [activeRide?.id, activeRide?.status]);

  const searchPlaces = async (val: string) => {
    if (!val.trim()) { setSearchSuggestions([]); return; }
    try {
      const res = await fetch(`${API_BASE}/api/places/search?q=${encodeURIComponent(val)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchSuggestions(data.places || []);
      }
    } catch (e) { }
  };

  const searchPickupPlaces = async (val: string) => {
    if (!val.trim()) { setPickupSuggestions([]); return; }
    try {
      const res = await fetch(`${API_BASE}/api/places/search?q=${encodeURIComponent(val)}`);
      if (res.ok) {
        const data = await res.json();
        setPickupSuggestions(data.places || []);
      }
    } catch (e) { }
  };

  const handlePickupChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPickupQuery(val);
    setPickupConfirmed(false);
    setPickup(null);
    setRideEstimates([]);
    if (pickupGeocodeRef.current) clearTimeout(pickupGeocodeRef.current);
    pickupGeocodeRef.current = setTimeout(() => { searchPickupPlaces(val); }, 400);
  };

  const choosePickupSuggestion = (place: any) => {
    setPickup({ lat: place.lat, lng: place.lng });
    setPickupAddress(place.name);
    setPickupQuery(place.name);
    setPickupSuggestions([]);
    setPickupConfirmed(true);
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      showToast("Geolocation not supported by your browser", "error");
      return;
    }
    showToast("Getting your location...", "info");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setPickup({ lat, lng });
        setPickupConfirmed(true);
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
            { headers: { "User-Agent": "GitaRide/1.0" } }
          );
          if (res.ok) {
            const data = await res.json();
            const name = data.address?.suburb || data.address?.neighbourhood || data.address?.city_district || data.display_name.split(",")[0];
            setPickupAddress(name);
            setPickupQuery(name);
          }
        } catch {
          setPickupAddress("Current Location");
          setPickupQuery("Current Location");
        }
        showToast("Pickup location set!", "success");
      },
      () => {
        showToast("Could not get location. Search manually.", "error");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleDestinationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDropQuery(val);
    if (autoGeocodeRef.current) clearTimeout(autoGeocodeRef.current);
    autoGeocodeRef.current = setTimeout(() => { searchPlaces(val); }, 400);
  };

  const chooseSuggestion = async (place: any) => {
    setDrop({ lat: place.lat, lng: place.lng });
    setDropAddress(place.name);
    setDropQuery(place.name);
    setSearchSuggestions([]);

    if (!pickup) return; // don't estimate without pickup

    try {
      const res = await fetch(`${API_BASE}/api/rides/estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickup, drop: { lat: place.lat, lng: place.lng }, weather: "Clear" })
      });
      if (res.ok) {
        const est = await res.json();
        setRideEstimates(est.estimates || []);
        setDistanceKm(est.distanceKm);
        setDurationMin(est.durationMin);
        if (est.estimates.length > 0) {
          setSelectedEstimateId(est.estimates[0].id);
          await fetchNearbyDrivers(pickup, "economy");
        }
        setPreviewRoute(est.route || []);
      }
    } catch (err) { }
  };

  const handleBookRide = async () => {
    if (!pickup || !drop) return;
    const selectedOption = rideEstimates.find(r => r.id === selectedEstimateId) || rideEstimates[0];
    if (!selectedOption) return;

    try {
      const res = await fetch(`${API_BASE}/api/rides/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickup: { ...pickup, address: pickupAddress },
          drop: { ...drop, address: dropAddress || dropQuery },
          rideType: selectedOption.rideType,
          fare: selectedOption.fare,
          breakdown: selectedOption.breakdown,
          targetDriverId: selectedDriverId
        })
      });

      if (res.ok) {
        const data = await res.json();
        setActiveRide(data.ride);
        // Immediately join socket room for this ride
        if (socketRef.current) {
          socketRef.current.emit("rider:join_ride", data.ride.id);
        }
        showToast("Ride search initialized. Waiting for drivers...", "success");
      }
    } catch (e) { }
  };

  const handleCancelTrip = async () => {
    await fetch(`${API_BASE}/api/rides/cancel`, { method: "POST" });
    setActiveRide(null);
    setActiveDriver(null);
    setDrop(null);
    setDropAddress("");
    setDropQuery("");
    setRideEstimates([]);
    setPreviewRoute([]);
    setNearbyDrivers([]);
    setSelectedDriverId("");
    setDriverRejected(false);
    showToast("Trip cancelled.", "info");
  };

  const [showRatingSheet, setShowRatingSheet] = useState(false);
  const [ratingStars, setRatingStars] = useState(5);
  const [ratingComment, setRatingComment] = useState("");
  const [lastCompletedRideId, setLastCompletedRideId] = useState<string | null>(null);
  const [tipAmount, setTipAmount] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (activeRide?.status === "completed" && activeRide.id && !showRatingSheet) {
      setLastCompletedRideId(activeRide.id);
      setShowRatingSheet(true);
    }
  }, [activeRide?.status]);

  useEffect(() => {
    if (!activeRide?.id) return;
    const loadMessages = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/chat?rideId=${activeRide.id}`);
        if (res.ok) { const data = await res.json(); setMessages(data.messages || []); }
      } catch { }
    };
    loadMessages();
    const interval = setInterval(loadMessages, 5000);
    return () => clearInterval(interval);
  }, [activeRide?.id]);

  const { signOut } = useClerk();

  const handleVerifyOtp = async () => {
    if (!activeRide) return;
    try {
      const res = await fetch(`${API_BASE}/api/rides/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: otpValueInput, rideId: activeRide.id })
      });
      if (res.ok) {
        const data = await res.json();
        setActiveRide(data.ride);
        setOtpVerifyError("");
        showToast("OTP verified! Trip started 🚀", "success");
      } else {
        setOtpVerifyError("Incorrect OTP. Try again.");
      }
    } catch { }
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || !activeRide) return;
    const msg = chatInput.trim();
    setChatInput("");
    try {
      const res = await fetch(`${API_BASE}/api/chat/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rideId: activeRide.id, content: msg })
      });
      if (res.ok) { const data = await res.json(); setMessages(data.messages || []); }
    } catch { }
  };

  // sosActive is already declared above
  const handleSOS = async () => {
    if (sosActive) return;
    setSosActive(true);
    await fetch(`${API_BASE}/api/safety/sos`, { method: "POST" });
    showToast("🚨 SOS sent! Emergency contacts alerted.", "sos");
    setTimeout(() => setSosActive(false), 10000);
  };

  const handleRateRide = async () => {
    if (!lastCompletedRideId) return;
    await fetch(`${API_BASE}/api/rides/rate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rideId: lastCompletedRideId, stars: ratingStars, comment: ratingComment })
    });
    setShowRatingSheet(false);
    setRatingComment("");
    setRatingStars(5);
    setLastCompletedRideId(null);
    setTipAmount(0);

    // Complete reset — back to home, ready for next ride
    setActiveRide(null);
    setActiveDriver(null);
    setActiveDriverLocation(null);
    setLiveLocation(null);
    setPreviewRoute([]);
    setPickup(INDIA_CENTER);
    setPickupAddress("");
    setPickupQuery("");
    setPickupConfirmed(false);
    setDropQuery("");
    setDrop(null);
    setDropAddress("");
    setRideEstimates([]);
    setNearbyDrivers([]);
    setSelectedDriverId("");
    setDriverRejected(false);
    setActiveTab("home");
    showToast("Thanks for your rating! Have a great day 🎉", "success");
    fetchData(true); // skip active ride re-fetch so we don't undo the null reset
  };

  const handleSkipRating = () => {
    setShowRatingSheet(false);
    setLastCompletedRideId(null);
    setTipAmount(0);
    setActiveRide(null);
    setActiveDriver(null);
    setActiveDriverLocation(null);
    setLiveLocation(null);
    setPreviewRoute([]);
    setPickup(INDIA_CENTER);
    setPickupAddress("");
    setPickupQuery("");
    setPickupConfirmed(false);
    setDropQuery("");
    setDrop(null);
    setDropAddress("");
    setRideEstimates([]);
    setNearbyDrivers([]);
    setSelectedDriverId("");
    setDriverRejected(false);
    setActiveTab("home");
  };

  const handleSwitchRole = () => {
    localStorage.removeItem("user_role");
    localStorage.removeItem("pending_role");
    sessionStorage.removeItem("demo_bypass");
    setUserRole(null);
    setDriverProfile(null);
    setCheckingDriverProfile(false);
    signOut({ redirectUrl: "/" }); // Use Clerk's signOut to clear session and redirect
  };

  // Clerk hasn't initialised yet — wait for its own state
  if (!clerkLoaded) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-white border-t-transparent animate-spin" />
      </div>
    );
  }

  // Clerk is ready but authenticated user's data hasn't loaded yet
  if (isAuthenticated && !dataLoaded) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
        <p className="text-zinc-400 text-sm font-semibold">Loading your profile...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <CustomSignIn onBypass={() => {
      sessionStorage.setItem("demo_bypass", "true");
      setIsDemoBypass(true);
      // Immediately sync role state from storage to avoid loading hang
      const role = localStorage.getItem("user_role") as "rider" | "driver" | null;
      if (role) setUserRole(role);
    }} />;
  }

  if (userRole === "driver") {
    // State 1 — checking MongoDB for existing profile
    if (checkingDriverProfile) {
      return (
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
          <p className="text-zinc-400 text-sm font-semibold">Loading your driver profile...</p>
        </div>
      );
    }

    // State 2 — no profile in DB → show registration form
    if (!driverProfile) {
      return (
        <DriverRegistration
          userId={clerkUser?.id || user?.id || `driver_${Date.now()}`}
          userName={clerkUser?.fullName || user?.name || "Driver"}
          onComplete={(profile) => {
            setDriverProfile(profile);
          }}
          onBack={() => {
            localStorage.removeItem("user_role");
            localStorage.removeItem("pending_role");
            sessionStorage.removeItem("demo_bypass");
            setUserRole(null);
            setDriverProfile(null);
            setCheckingDriverProfile(false);
            signOut({ redirectUrl: "/" });
          }}
        />
      );
    }

    // State 3 — profile found → show dashboard
    return (
      <DriverDashboard
        driverInfo={{
          id: driverProfile.id,
          name: driverProfile.name,
          avatar: driverProfile.avatar || ""
        }}
        onSwitchRole={handleSwitchRole}
      />
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 text-zinc-950 font-sans">

      {/* Toast */}
      {toastMessage && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-[9999] px-6 py-3.5 rounded-xl shadow-2xl flex items-center gap-3 text-white text-sm font-semibold ${toastType === "sos" ? "bg-red-600" : toastType === "success" ? "bg-emerald-600" : toastType === "error" ? "bg-red-500" : "bg-zinc-900"
          }`}>
          {toastMessage}
        </div>
      )}

      {/* Rating Sheet */}
      {showRatingSheet && (
        <div className="fixed inset-0 bg-black/60 z-[9998] flex items-end justify-center">
          <div className="w-full max-w-md bg-white rounded-t-3xl p-6 space-y-5 pb-10 relative">
            <button onClick={handleSkipRating} className="absolute right-6 top-6 text-zinc-400 hover:text-zinc-600 p-1">
              <X size={20} />
            </button>
            <div className="w-10 h-1 bg-zinc-200 rounded-full mx-auto"></div>
            <h2 className="text-2xl font-black text-center">Rate your ride</h2>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map(s => (
                <button key={s} onClick={() => setRatingStars(s)}
                  className={`text-4xl transition-all ${s <= ratingStars ? "text-amber-400" : "text-zinc-200"}`}>★</button>
              ))}
            </div>
            <input value={ratingComment} onChange={e => setRatingComment(e.target.value)}
              placeholder="Leave a comment (optional)..."
              className="w-full border border-zinc-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
            <div>
              <p className="text-xs font-bold text-zinc-500 mb-2">ADD A TIP</p>
              <div className="flex gap-2">
                {[0, 20, 50, 100].map(t => (
                  <button key={t} onClick={async () => {
                    setTipAmount(t);
                    if (lastCompletedRideId) {
                      await fetch(`${API_BASE}/api/rides/tip`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ rideId: lastCompletedRideId, tip: t })
                      });
                    }
                  }} className={`flex-1 py-2.5 rounded-xl text-sm font-black transition-all ${tipAmount === t ? "bg-black text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"}`}>
                    {t === 0 ? "No tip" : `₹${t}`}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={handleRateRide}
              className="w-full py-4 bg-black text-white font-black rounded-xl hover:bg-zinc-800 transition-colors">
              Submit Rating
            </button>
          </div>
        </div>
      )}

      {/* Compact Header */}
      <nav className="sticky top-0 bg-white border-b border-zinc-100 z-50">
        <div className="max-w-7xl mx-auto px-4 h-[52px] flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 bg-black text-white flex items-center justify-center rounded-lg shrink-0">
              <Navigation size={15} className="text-white" />
            </div>
            {/* Desktop tab icons */}
            <div className="hidden md:flex gap-1">
              {([{ tab: "home", Icon: Home }, { tab: "activity", Icon: Activity }, { tab: "profile", Icon: User }] as const).map(({ tab, Icon }) => (
                <button key={tab} onClick={() => setActiveTab(tab as any)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${activeTab === tab ? "bg-zinc-100 text-black" : "text-zinc-400 hover:text-zinc-700"}`}>
                  <Icon size={13} />{tab}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 items-center">
            {user && (
              <div className="flex items-center gap-1 text-xs font-black bg-emerald-50 text-emerald-700 px-2.5 py-1.5 rounded-lg border border-emerald-100">
                <WalletIcon size={12} />₹{user.balance}
              </div>
            )}
            <SignedIn><UserButton afterSignOutUrl="/" /></SignedIn>
          </div>
        </div>
      </nav>

      {/* Fixed Bottom Nav — mobile only */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white/95 backdrop-blur border-t border-zinc-100 flex">
        {([
          { tab: "home", Icon: Home, label: "Home" },
          { tab: "activity", Icon: Activity, label: "Rides" },
          { tab: "profile", Icon: User, label: "Profile" },
        ] as const).map(({ tab, Icon, label }) => (
          <button key={tab} onClick={() => setActiveTab(tab as any)}
            className={`flex-1 flex flex-col items-center justify-center py-3 gap-0.5 transition-colors ${activeTab === tab ? "text-black" : "text-zinc-400"}`}>
            <Icon size={20} strokeWidth={activeTab === tab ? 2.5 : 1.5} />
            <span className="text-[10px] font-bold">{label}</span>
          </button>
        ))}
      </div>

      {/* ACTIVITY TAB */}
      {activeTab === "activity" && (
        <div className="max-w-2xl mx-auto w-full p-4 pb-24 md:pb-4 space-y-3">
          <h2 className="text-2xl font-black py-2">Ride History</h2>
          {rideHistory.length === 0 ? (
            <div className="text-center py-16 text-zinc-400">
              <Car size={40} className="mx-auto mb-3 text-zinc-200" />
              <p className="font-semibold">No completed rides yet</p>
              <p className="text-xs mt-1">Book your first ride to see it here</p>
            </div>
          ) : rideHistory.map(r => (
            <div key={r.id} className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div className="flex-1 mr-3">
                  <p className="font-black text-sm">{(r.pickup as any).address} → {(r.drop as any).address}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">{r.timeline?.completedAt ? new Date(r.timeline.completedAt).toLocaleString() : ""}</p>
                </div>
                <p className="font-black text-lg text-emerald-600 shrink-0">₹{r.fare}</p>
              </div>
              <div className="flex gap-2">
                <span className="text-xs font-bold bg-zinc-100 text-zinc-600 px-2 py-1 rounded-lg capitalize">{r.rideType}</span>
                <span className={`text-xs font-bold px-2 py-1 rounded-lg capitalize ${r.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{r.status}</span>
                <span className="text-xs font-bold bg-zinc-100 text-zinc-500 px-2 py-1 rounded-lg">{r.distanceKm} km</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PROFILE TAB */}
      {activeTab === "profile" && user && (
        <div className="max-w-2xl mx-auto w-full p-4 pb-24 md:pb-4 space-y-4">
          <div className="bg-white border border-zinc-200 rounded-2xl p-5 flex items-center gap-4">
            <img src={user.avatar} alt={user.name} className="h-16 w-16 rounded-full object-cover" onError={e => { (e.target as any).src = "https://ui-avatars.com/api/?name=" + user.name; }} />
            <div>
              <p className="font-black text-lg">{user.name}</p>
              <p className="text-sm text-zinc-500">{user.email}</p>
              <div className="flex items-center gap-1 mt-1">
                <Star size={13} className="text-amber-400 fill-amber-400" />
                <span className="text-sm font-bold">{user.rating}</span>
                <span className="text-xs text-zinc-400 ml-1">{user.tripCount} trips</span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Wallet Balance</p>
                <p className="text-3xl font-black">₹{user.balance}</p>
              </div>
              <div className="h-12 w-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                <WalletIcon size={22} className="text-emerald-700" />
              </div>
            </div>
            <div className="flex gap-2">
              {[100, 200, 500].map(amt => (
                <button key={amt} onClick={async () => {
                  const res = await fetch(`${API_BASE}/api/user/topup`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ amount: amt })
                  });
                  if (res.ok) { fetchData(); showToast(`₹${amt} added to wallet!`, "success"); }
                }} className="flex-1 py-2.5 bg-black text-white font-black text-sm rounded-xl hover:bg-zinc-800 transition-colors">
                  +₹{amt}
                </button>
              ))}
            </div>
            {transactions.length > 0 && (
              <div className="space-y-1 pt-2 border-t border-zinc-100">
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Recent Transactions</p>
                {transactions.slice(0, 6).map((tx: any) => (
                  <div key={tx.id} className="flex justify-between items-center py-2">
                    <div>
                      <p className="text-sm font-bold">{tx.description || tx.title || "Transaction"}</p>
                      <p className="text-xs text-zinc-400">{tx.date ? new Date(tx.date).toLocaleString() : ""}</p>
                    </div>
                    <p className={`font-black text-sm ${tx.type === "credit" ? "text-emerald-600" : "text-red-500"}`}>
                      {tx.type === "credit" ? "+" : "−"}₹{Math.abs(tx.amount)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-3">
            <p className="font-black">Emergency Contacts</p>
            {user.emergencyContacts.length === 0 && (
              <p className="text-xs text-zinc-400">No emergency contacts added yet.</p>
            )}
            {user.emergencyContacts.map((c: any, i: number) => (
              <div key={i} className="flex justify-between items-center p-3 bg-zinc-50 rounded-xl">
                <div>
                  <p className="font-bold text-sm">{c.name}</p>
                  <p className="text-xs text-zinc-500">{c.phone}</p>
                </div>
                <button onClick={async () => {
                  await fetch(`${API_BASE}/api/user/delete_contact`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ phone: c.phone })
                  });
                  fetchData();
                }} className="text-red-400 hover:text-red-600 p-1">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* HOME TAB */}
      {activeTab === "home" && (
        <div className="flex-1 flex flex-col md:flex-row relative overflow-hidden">

          {/* Sidebar Panel */}
          <div className="w-full md:w-[400px] h-[50vh] md:h-[calc(100vh-52px)] bg-white shadow-xl z-10 flex flex-col overflow-y-auto">

            {/* ── ACTIVE RIDE ── */}
            {activeRide && activeRide.status !== "completed" ? (
              <div className="flex flex-col h-full">

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {activeDriver && activeRide.status !== "searching" && (
                    <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-4 flex items-center gap-4">
                      <img src={activeDriver.avatar} alt={activeDriver.name}
                        className="h-14 w-14 rounded-full object-cover border-2 border-white shadow"
                        onError={e => { (e.target as any).src = "https://ui-avatars.com/api/?name=" + activeDriver.name; }} />
                      <div className="flex-1">
                        <p className="font-black text-lg">{activeDriver.name}</p>
                        <p className="text-sm text-zinc-500">{activeDriver.vehicle?.color} {activeDriver.vehicle?.make} {activeDriver.vehicle?.model}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs font-black bg-zinc-200 px-2 py-0.5 rounded-lg">{activeDriver.vehicle?.plateNumber}</span>
                          <div className="flex items-center gap-0.5">
                            <Star size={11} className="text-amber-400 fill-amber-400" />
                            <span className="text-xs font-bold">{activeDriver.rating}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="h-2.5 w-2.5 bg-emerald-500 rounded-full mt-1.5 shrink-0"></div>
                      <div><p className="text-xs font-bold text-zinc-400 uppercase">Pickup</p><p className="font-semibold text-sm">{(activeRide.pickup as any).address}</p></div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="h-2.5 w-2.5 bg-red-500 rounded-sm mt-1.5 shrink-0"></div>
                      <div><p className="text-xs font-bold text-zinc-400 uppercase">Drop</p><p className="font-semibold text-sm">{(activeRide.drop as any).address}</p></div>
                    </div>
                    <div className="flex justify-between text-xs font-bold text-zinc-500 border-t border-zinc-100 pt-3">
                      <span>{activeRide.distanceKm} km</span>
                      <span>{activeRide.durationMin} min</span>
                      <span className="text-zinc-800 text-sm">₹{activeRide.fare}</span>
                    </div>
                  </div>

                  {activeRide.status === "arrived" && (
                    <div className="p-5 bg-emerald-50 border-2 border-emerald-500 rounded-2xl text-center space-y-3">
                      <div className="text-3xl">🚗</div>
                      <p className="font-black text-emerald-800">Your driver has arrived!</p>
                      <p className="text-zinc-600 text-sm">Show this OTP to your driver</p>
                      <div className="bg-white border-2 border-emerald-400 rounded-xl py-4 px-6">
                        <p className="text-4xl font-black tracking-[0.3em] text-emerald-700">
                          {activeRide.otp}
                        </p>
                      </div>
                      <p className="text-zinc-400 text-xs">Driver will enter this to start the trip</p>
                    </div>
                  )}

                  {activeRide.status !== "searching" && (
                    <button onClick={handleSOS}
                      className={`w-full py-3 font-black text-sm rounded-xl flex items-center justify-center gap-2 transition-all ${sosActive ? "bg-red-600 text-white animate-pulse" : "bg-red-50 text-red-600 border border-red-100 hover:bg-red-100"
                        }`}>
                      <ShieldAlert size={16} />
                      {sosActive ? "SOS Sent — Help is Coming" : "SOS Emergency"}
                    </button>
                  )}

                  {activeRide.status !== "searching" && (
                    <div className="border border-zinc-200 rounded-2xl overflow-hidden">
                      <button onClick={() => setIsChatOpen(v => !v)}
                        className="w-full p-3 flex items-center justify-between bg-zinc-50 hover:bg-zinc-100 transition-colors">
                        <div className="flex items-center gap-2 font-bold text-sm">
                          <MessageSquare size={15} />Chat with driver
                          {messages.filter(m => m.senderId === "driver").length > 0 && (
                            <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full font-black">
                              {messages.filter(m => m.senderId === "driver").length}
                            </span>
                          )}
                        </div>
                        <ChevronRight size={15} className={`transition-transform text-zinc-400 ${isChatOpen ? "rotate-90" : ""}`} />
                      </button>
                      {isChatOpen && (
                        <div className="flex flex-col">
                          <div className="h-44 overflow-y-auto p-3 space-y-2 bg-white">
                            {messages.length === 0 ? (
                              <p className="text-xs text-zinc-400 text-center py-6">No messages yet. Say hi!</p>
                            ) : messages.map(m => (
                              <div key={m.id} className={`flex ${m.senderId === "rider" ? "justify-end" : "justify-start"}`}>
                                <div className={`max-w-[78%] px-3 py-2 rounded-xl text-xs font-medium leading-relaxed ${m.senderId === "rider" ? "bg-black text-white rounded-br-sm" :
                                  m.senderId === "system" ? "bg-blue-50 text-blue-800 border border-blue-100 text-center w-full rounded-xl" :
                                    "bg-zinc-100 text-zinc-800 rounded-bl-sm"
                                  }`}>
                                  {m.senderId !== "rider" && m.senderId !== "system" && (
                                    <p className="font-black text-[10px] text-zinc-500 mb-0.5">{m.senderName}</p>
                                  )}
                                  {m.content}
                                </div>
                              </div>
                            ))}
                            <div ref={chatEndRef} />
                          </div>
                          <div className="flex gap-2 p-2 border-t border-zinc-100 bg-zinc-50">
                            <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                              onKeyDown={e => e.key === "Enter" && handleSendChat()}
                              placeholder="Message driver..."
                              className="flex-1 bg-white border border-zinc-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black" />
                            <button onClick={handleSendChat}
                              className="px-3 py-2 bg-black text-white rounded-xl hover:bg-zinc-800 transition-colors">
                              <Send size={14} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-zinc-100">
                  <button onClick={handleCancelTrip}
                    className="w-full py-3 bg-red-50 text-red-700 font-black rounded-xl hover:bg-red-100 transition-colors text-sm border border-red-100">
                    Cancel Trip
                  </button>
                </div>
              </div>
            ) : !activeRide ? (
              /* ── BOOKING VIEW ── */
              <div className="flex flex-col h-full overflow-y-auto">
                <div className="p-4 space-y-3">

                  {/* Uber-style unified search card */}
                  <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-visible">
                    {/* Pickup row */}
                    <div className="flex items-center px-4 py-3.5 gap-3">
                      <div className="h-2.5 w-2.5 bg-emerald-500 rounded-full shrink-0" />
                      <input
                        type="text"
                        placeholder="Pickup location..."
                        value={pickupQuery}
                        onChange={handlePickupChange}
                        onFocus={() => { if (!pickupQuery) searchPickupPlaces(""); }}
                        className={`flex-1 text-sm font-semibold outline-none bg-transparent min-w-0 ${pickupConfirmed ? "text-emerald-700" : "text-zinc-800 placeholder-zinc-400"
                          }`}
                      />
                      {pickupConfirmed && (
                        <button onClick={() => {
                          setPickup(null); setPickupAddress(""); setPickupQuery("");
                          setPickupConfirmed(false); setDrop(null); setDropAddress("");
                          setDropQuery(""); setRideEstimates([]);
                        }} className="h-5 w-5 bg-zinc-100 hover:bg-zinc-200 rounded-full flex items-center justify-center transition-colors shrink-0">
                          <X size={11} className="text-zinc-500" />
                        </button>
                      )}
                    </div>

                    {/* Connector + drop row — only after pickup confirmed */}
                    {pickupConfirmed && (
                      <>
                        <div className="flex items-center px-4">
                          <div className="flex flex-col gap-[3px] mr-[9px]">
                            <div className="h-[3px] w-[3px] bg-zinc-300 rounded-full" />
                            <div className="h-[3px] w-[3px] bg-zinc-300 rounded-full" />
                            <div className="h-[3px] w-[3px] bg-zinc-300 rounded-full" />
                          </div>
                          <div className="h-px flex-1 bg-zinc-100" />
                        </div>
                        <div className="flex items-center px-4 py-3.5 gap-3">
                          <div className="h-2.5 w-2.5 bg-red-500 rounded-sm shrink-0" />
                          <input
                            type="text"
                            placeholder="Where to?"
                            value={dropQuery}
                            onChange={handleDestinationChange}
                            autoFocus
                            className="flex-1 text-sm font-semibold outline-none bg-transparent text-zinc-800 placeholder-zinc-400 min-w-0"
                          />
                        </div>
                      </>
                    )}
                  </div>

                  {/* GPS button — only when pickup not confirmed */}
                  {!pickupConfirmed && (
                    <button onClick={useCurrentLocation}
                      className="w-full py-3 flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 font-bold text-sm rounded-xl transition-colors">
                      <Navigation size={14} />
                      Use my current location
                    </button>
                  )}
                </div>

                {/* Pickup suggestions */}
                {pickupSuggestions.length > 0 && !pickupConfirmed && (
                  <div className="mx-4 mb-2 bg-white border border-zinc-200 rounded-2xl shadow-xl overflow-hidden z-30">
                    {pickupSuggestions.slice(0, 5).map((s, i) => (
                      <div key={i} onClick={() => choosePickupSuggestion(s)}
                        className="px-4 py-3 border-b border-zinc-50 last:border-0 hover:bg-zinc-50 cursor-pointer flex items-center gap-3">
                        <div className="h-7 w-7 bg-emerald-100 rounded-lg flex items-center justify-center shrink-0">
                          <MapPin size={13} className="text-emerald-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-sm">{s.name}</p>
                          <p className="text-xs text-zinc-400 truncate">{s.address}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Drop suggestions */}
                {searchSuggestions.length > 0 && pickupConfirmed && (
                  <div className="mx-4 mb-2 bg-white border border-zinc-200 rounded-2xl shadow-xl overflow-hidden z-30">
                    {searchSuggestions.slice(0, 5).map((s, i) => (
                      <div key={i} onClick={() => chooseSuggestion(s)}
                        className="px-4 py-3 border-b border-zinc-50 last:border-0 hover:bg-zinc-50 cursor-pointer flex items-center gap-3">
                        <div className="h-7 w-7 bg-red-50 rounded-lg flex items-center justify-center shrink-0">
                          <MapPin size={13} className="text-red-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-sm">{s.name}</p>
                          <p className="text-xs text-zinc-400 truncate">{s.address}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Ride estimates + driver selection */}
                {rideEstimates.length > 0 && (
                  <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
                    {/* Distance info */}
                    <div className="flex items-center justify-between pt-1">
                      <h3 className="font-black text-sm">Choose a ride</h3>
                      <span className="text-xs text-zinc-500 font-semibold">{distanceKm} km · {durationMin} min</span>
                    </div>

                    {/* Horizontal chip row */}
                    <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4" style={{ scrollbarWidth: "none" }}>
                      {rideEstimates.map(est => (
                        <button key={est.id} onClick={() => setSelectedEstimateId(est.id)}
                          className={`flex items-center gap-2 px-4 py-3 rounded-2xl border-2 shrink-0 transition-all ${selectedEstimateId === est.id
                            ? "border-black bg-black text-white"
                            : "border-zinc-200 bg-white text-zinc-700"
                            }`}>
                          <Car size={15} />
                          <div className="text-left">
                            <p className="text-xs font-black whitespace-nowrap leading-tight">{est.name.split(" ")[0]}</p>
                            <p className={`text-xs font-black ${selectedEstimateId === est.id ? "text-zinc-300" : "text-zinc-500"}`}>₹{est.fare}</p>
                          </div>
                          {est.surgeMultiplier > 1 && <span className="text-[10px]">⚡</span>}
                        </button>
                      ))}
                    </div>

                    {/* Driver selection */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Nearby Drivers</p>
                        <span className="text-xs text-zinc-400">{nearbyDrivers.length} available</span>
                      </div>

                      {nearbyDrivers.length === 0 ? (
                        <div className="p-5 bg-zinc-50 rounded-2xl text-center space-y-2">
                          <p className="text-2xl">🚗</p>
                          <p className="font-black text-sm text-zinc-700">No drivers nearby</p>
                          <p className="text-xs text-zinc-400">Drivers need to go online first</p>
                          <button onClick={() => fetchNearbyDrivers(pickup, "economy")}
                            className="mt-1 px-4 py-2 bg-black text-white text-xs font-bold rounded-xl">Refresh</button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {nearbyDrivers.map(driver => (
                            <div key={driver.id} onClick={() => setSelectedDriverId(driver.id)}
                              className={`flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all ${selectedDriverId === driver.id
                                ? "border-l-4 border-emerald-500 bg-emerald-50/40 border-2"
                                : "border-2 border-zinc-100 hover:border-zinc-200"
                                }`}>
                              <div className="relative shrink-0">
                                <img src={driver.avatar || `https://ui-avatars.com/api/?name=${driver.name}&size=40`}
                                  alt={driver.name}
                                  className="h-10 w-10 rounded-full object-cover"
                                  onError={e => { (e.target as any).src = `https://ui-avatars.com/api/?name=${driver.name}`; }} />
                                <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 bg-emerald-500 rounded-full border-2 border-white" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-sm">{driver.name}</p>
                                <p className="text-xs text-zinc-500 truncate">{driver.vehicle.color} {driver.vehicle.make} · {driver.vehicle.plateNumber}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-xs font-black text-emerald-600">{driver.etaMin} min</p>
                                <p className="text-xs text-zinc-400">{driver.distanceKm} km</p>
                                <div className="flex items-center gap-0.5 justify-end">
                                  <span className="text-amber-400 text-[10px]">★</span>
                                  <span className="text-[10px] font-bold">{driver.rating}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {driverRejected && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700">
                          ⚠️ Driver declined. Please select another.
                        </div>
                      )}
                    </div>

                    <button onClick={() => { setDriverRejected(false); handleBookRide(); }}
                      disabled={!selectedDriverId || nearbyDrivers.length === 0}
                      className="w-full h-14 bg-black text-white rounded-2xl flex items-center justify-between px-5 hover:bg-zinc-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed sticky bottom-0 shadow-xl">
                      <span className="font-black text-sm">Request {nearbyDrivers.find(d => d.id === selectedDriverId)?.name || "Driver"}</span>
                      <span className="font-black text-lg">₹{rideEstimates.find(e => e.id === selectedEstimateId)?.fare || rideEstimates[0]?.fare}</span>
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Map */}
          <div className="flex-1 h-[50vh] md:h-[calc(100vh-52px)] relative">
            {/* Floating status pill */}
            {activeRide && activeRide.status !== "completed" && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-white/95 backdrop-blur shadow-lg rounded-full px-4 py-2 flex items-center gap-2 text-xs font-black pointer-events-none whitespace-nowrap">
                <div className={`h-2 w-2 rounded-full ${activeRide.status === "searching" ? "bg-blue-500 animate-pulse" :
                  activeRide.status === "accepted" ? "bg-emerald-500 animate-pulse" :
                    activeRide.status === "arrived" ? "bg-amber-500" :
                      "bg-purple-500 animate-pulse"
                  }`} />
                {activeRide.status === "searching" && "Searching for drivers..."}
                {activeRide.status === "accepted" && "Driver on the way"}
                {activeRide.status === "arrived" && "Driver has arrived"}
                {activeRide.status === "in_progress" && "Trip in progress"}
              </div>
            )}
            <MapComponent
              pickup={pickup}
              drop={drop}
              route={activeRide?.route || previewRoute}
              driver={activeDriver}
              driverLocation={activeDriverLocation}
              riderLocation={liveLocation}
              userLocation={pickup || INDIA_CENTER}
              followDriver={!!activeRide && activeRide.status === "accepted"}
              weatherCondition="Clear"
            />
          </div>
        </div>
      )}
    </div>
  );
}
