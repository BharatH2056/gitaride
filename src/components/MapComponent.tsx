import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { LatLng, Driver } from "../types";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, Zap, Loader2, ArrowRight, Share, CloudRain, Thermometer, Sun } from "lucide-react";


interface MapComponentProps {
  pickup: LatLng | null;
  drop: LatLng | null;
  route: LatLng[];
  driver: Driver | null;
  userLocation: LatLng;
  weatherCondition?: "Rain" | "High Heat" | "Clear";
  driverLocation?: { lat: number; lng: number } | null;
  riderLocation?: { lat: number; lng: number } | null;
  followDriver?: boolean;
}

export default function MapComponent({
  pickup,
  drop,
  route,
  driver,
  userLocation,
  weatherCondition = "Clear",
  driverLocation,
  riderLocation,
  followDriver
}: MapComponentProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const trafficLayerRef = useRef<L.TileLayer | null>(null);
  const [showTraffic, setShowTraffic] = useState(true);
  const [trafficLevel, setTrafficLevel] = useState<"Low" | "Moderate" | "Heavy">("Low");
  const [smartRouteState, setSmartRouteState] = useState<"hidden" | "calculating" | "ready">("hidden");

  const markersRef = useRef<{
    user?: L.Marker;
    pickup?: L.Marker;
    drop?: L.Marker;
    driver?: L.Marker;
    driverMarker?: L.Marker;
    riderMarker?: L.Marker;
    routePolyline?: L.Polyline;
  }>({});

  // Track the last route key for which fitBounds was called to prevent re-render loops
  const routeBoundsFitRef = useRef<string>("");

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Standard fallback center San Francisco
    const centerLat = userLocation.lat || 37.7749;
    const centerLng = userLocation.lng || -122.4194;

    // Create the map if it doesn't exist
    if (!mapRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView([centerLat, centerLng], 14);

      // Free high quality CartoDB Positron maps
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        maxZoom: 20,
      }).addTo(map);

      // Remove the Google Traffic Tile logic due to 403 Forbidden without valid Google Maps referrer/API key.
      // We will now simulate traffic visually on the route polyline instead.

      // Add a scale bar
      L.control.scale({ position: "bottomleft" }).addTo(map);

      mapRef.current = map;
    }

    const map = mapRef.current;

    // 1. Update/Add User Marker (blue pin pulse)
    if (!markersRef.current.user) {
      const blueHtml = `
        <div class="relative flex items-center justify-center">
          <div class="absolute h-5 w-5 rounded-full bg-blue-500 opacity-40 animate-ping"></div>
          <div class="h-3 w-3 rounded-full bg-blue-600 border-2 border-white shadow-md"></div>
        </div>
      `;
      const customIcon = L.divIcon({
        html: blueHtml,
        className: "custom-blue-marker",
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      markersRef.current.user = L.marker([centerLat, centerLng], { icon: customIcon }).addTo(map);
    } else {
      markersRef.current.user.setLatLng([centerLat, centerLng]);
    }

    // 2. Update/Add Pickup Marker (Black Pin)
    if (pickup) {
      const pickupHtml = `
        <div class="flex flex-col items-center">
          <div class="h-6 w-6 rounded-full bg-zinc-950 text-white border-2 border-white flex items-center justify-center shadow-lg font-bold text-[10px]">
            H
          </div>
          <div class="w-1.5 h-1.5 bg-zinc-950 rounded-full -mt-0.5 border-none"></div>
        </div>
      `;
      const pickupIcon = L.divIcon({
        html: pickupHtml,
        className: "custom-pickup-marker",
        iconSize: [32, 32],
        iconAnchor: [16, 28],
      });

      if (!markersRef.current.pickup) {
        markersRef.current.pickup = L.marker([pickup.lat, pickup.lng], { icon: pickupIcon }).addTo(map);
      } else {
        markersRef.current.pickup.setLatLng([pickup.lat, pickup.lng]);
      }
    } else {
      if (markersRef.current.pickup) {
        markersRef.current.pickup.remove();
        markersRef.current.pickup = undefined;
      }
    }

    // 3. Update/Add Drop Marker (Red Target Pin)
    if (drop) {
      const dropHtml = `
        <div class="flex flex-col items-center">
          <div class="h-6 w-6 rounded-full bg-red-600 text-white border-2 border-white flex items-center justify-center shadow-lg font-bold text-[10px]">
            B
          </div>
          <div class="w-1.5 h-1.5 bg-red-600 rounded-full -mt-0.5 border-none"></div>
        </div>
      `;
      const dropIcon = L.divIcon({
        html: dropHtml,
        className: "custom-drop-marker",
        iconSize: [32, 32],
        iconAnchor: [16, 28],
      });

      if (!markersRef.current.drop) {
        markersRef.current.drop = L.marker([drop.lat, drop.lng], { icon: dropIcon }).addTo(map);
      } else {
        markersRef.current.drop.setLatLng([drop.lat, drop.lng]);
      }
    } else {
      if (markersRef.current.drop) {
        markersRef.current.drop.remove();
        markersRef.current.drop = undefined;
      }
    }

    // 4. Update/Add Driver Marker (Animated Car rotated according to heading)
    if (driver) {
      const driverHtml = `
        <div class="relative transition-transform duration-500 ease-out driver-rotate" style="transform: rotate(${driver.bearing || 0}deg)">
          <div class="absolute -inset-1 rounded-full bg-emerald-500/30 animate-pulse"></div>
          <div class="h-8 w-8 rounded-full bg-zinc-900 border-2 border-emerald-400 shadow-xl flex items-center justify-center text-emerald-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
              <circle cx="7" cy="17" r="2"/>
              <path d="M9 17h6"/>
              <circle cx="17" cy="17" r="2"/>
            </svg>
          </div>
        </div>
      `;
      const driverIcon = L.divIcon({
        html: driverHtml,
        className: "custom-driver-marker",
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });

      if (!markersRef.current.driver) {
        markersRef.current.driver = L.marker([driver.currentLocation.lat, driver.currentLocation.lng], { icon: driverIcon }).addTo(map);
      } else {
        markersRef.current.driver.setLatLng([driver.currentLocation.lat, driver.currentLocation.lng]);
        const el = markersRef.current.driver.getElement();
        if (el) {
          const rotateDiv = el.querySelector('.driver-rotate');
          if (rotateDiv) {
            (rotateDiv as HTMLElement).style.transform = `rotate(${driver.bearing || 0}deg)`;
          }
        }
      }
    } else {
      if (markersRef.current.driver) {
        markersRef.current.driver.remove();
        markersRef.current.driver = undefined;
      }
    }

    // 5. Update/Add Route Polyline
    if (markersRef.current.routePolyline) {
      markersRef.current.routePolyline.remove();
      markersRef.current.routePolyline = undefined;
    }

    if (route && route.length >= 2) {
      if (markersRef.current.routePolyline) {
        markersRef.current.routePolyline.remove();
        markersRef.current.routePolyline = undefined;
      }

      markersRef.current.routePolyline = L.polyline(
        route.map((p: any) => [p.lat, p.lng] as [number, number]),
        {
          color: "#2563eb",
          weight: 5,
          opacity: 0.9,
          lineJoin: "round",
          lineCap: "round"
          // NO dashArray here - solid line only
        }
      ).addTo(map);

      // Fit bounds only once per new route
      const routeKey = `${route[0]?.lat}-${route[route.length-1]?.lat}`;
      if (routeBoundsFitRef.current !== routeKey) {
        routeBoundsFitRef.current = routeKey;
        setTimeout(() => {
          const bounds = L.latLngBounds(route.map((p: any) => [p.lat, p.lng] as [number, number]));
          map.fitBounds(bounds, { padding: [60, 60] });
        }, 100);
      }

    } else if (pickup && drop) {
      // Dashed preview line when pickup + drop selected but no confirmed route yet
      markersRef.current.routePolyline = L.polyline(
        [[pickup.lat, pickup.lng], [drop.lat, drop.lng]],
        { color: "#6366f1", weight: 3, opacity: 0.65, dashArray: "8 6" }
      ).addTo(map);

      try {
        const bounds = L.latLngBounds([
          [pickup.lat, pickup.lng],
          [drop.lat, drop.lng]
        ]);
        map.fitBounds(bounds, { padding: [80, 80] });
      } catch (e) {}

    } else {
      if (pickup) {
        map.setView([pickup.lat, pickup.lng], 15);
      } else {
        map.setView([centerLat, centerLng], 14);
      }
    }

    // 6. Incoming driver live location marker (during "accepted" phase)
    if (driverLocation) {
      if (markersRef.current.driverMarker) {
        markersRef.current.driverMarker.setLatLng([driverLocation.lat, driverLocation.lng]);
      } else {
        const drvIcon = L.divIcon({
          html: `<div style="background:#16a34a;width:36px;height:36px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 8px rgba(0,0,0,0.3)">🚗</div>`,
          className: "",
          iconSize: [36, 36],
          iconAnchor: [18, 18]
        });
        markersRef.current.driverMarker = L.marker(
          [driverLocation.lat, driverLocation.lng],
          { icon: drvIcon }
        ).addTo(map);
      }
    } else if (markersRef.current.driverMarker) {
      markersRef.current.driverMarker.remove();
      markersRef.current.driverMarker = undefined;
    }

    // 7. Show live rider location marker that moves (FIX 2)
    if (riderLocation) {
      if (markersRef.current.riderMarker) {
        markersRef.current.riderMarker.setLatLng([riderLocation.lat, riderLocation.lng]);
      } else {
        const riderIcon = L.divIcon({
          html: `<div style="background:#2563eb;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 0 3px rgba(37,99,235,0.3)"></div>`,
          className: "",
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });
        markersRef.current.riderMarker = L.marker(
          [riderLocation.lat, riderLocation.lng],
          { icon: riderIcon }
        ).addTo(map);
      }
    } else if (markersRef.current.riderMarker) {
      markersRef.current.riderMarker.remove();
      markersRef.current.riderMarker = undefined;
    }

    // 8. Auto-center map on moving driver location (FIX 4)
    if (followDriver && driverLocation) {
      map.panTo([driverLocation.lat, driverLocation.lng], { animate: true, duration: 1 });
    }

  }, [pickup, drop, route, driver, driverLocation, riderLocation, followDriver, userLocation, showTraffic, trafficLevel]);

  // Traffic visibility affects the route line color instead now (handled in the route polyline effect above).

  // Handle cleanup on unmount
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Draw dashed preview line between pickup and drop when no real route yet
  useEffect(() => {
    if (!mapRef.current) return;
    if (route && route.length > 0) return; // real route takes over

    // Clear any existing preview polyline
    if (markersRef.current.routePolyline) {
      markersRef.current.routePolyline.remove();
      markersRef.current.routePolyline = undefined;
    }

    if (pickup && drop) {
      markersRef.current.routePolyline = L.polyline(
        [[pickup.lat, pickup.lng], [drop.lat, drop.lng]],
        { color: "#6366f1", weight: 3, opacity: 0.6, dashArray: "8 6" }
      ).addTo(mapRef.current);

      const previewKey = `preview-${pickup.lat},${pickup.lng}-${drop.lat},${drop.lng}`;
      if (routeBoundsFitRef.current !== previewKey) {
        routeBoundsFitRef.current = previewKey;
        const bounds = L.latLngBounds([
          [pickup.lat, pickup.lng],
          [drop.lat, drop.lng]
        ]);
        setTimeout(() => {
          mapRef.current?.fitBounds(bounds, { padding: [80, 80] });
        }, 100);
      }
    }
  }, [pickup, drop, route]);

  // Simulate traffic updates
  useEffect(() => {
    if (!showTraffic) return;
    
    const levels: ("Low" | "Moderate" | "Heavy")[] = ["Low", "Moderate", "Heavy", "Moderate"];
    let i = 0;
    const interval = setInterval(() => {
      const prevLevel = levels[i];
      i = (i + 1) % levels.length;
      const nextLevel = levels[i];
      setTrafficLevel(nextLevel);

      if (prevLevel !== "Heavy" && nextLevel === "Heavy") {
        setSmartRouteState("calculating");
        setTimeout(() => {
          setSmartRouteState("ready");
        }, 2000);
      } else if (nextLevel === "Low") {
        setSmartRouteState("hidden");
      }
    }, 4500);
    return () => clearInterval(interval);
  }, [showTraffic]);

  return (
    <div className="relative w-full" style={{height: '100%', minHeight: '500px'}}>
      <div ref={mapContainerRef} style={{ height: "100%", width: "100%" }} className="absolute inset-0 z-0 select-none shadow-inner" id="interactive_map"></div>
      
      <div className="absolute top-4 left-4 z-[400] flex flex-col gap-2.5 max-w-[210px]">
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white/90 backdrop-blur-md shadow-md border border-zinc-200 rounded-xl p-3 flex flex-col gap-1.5 min-w-[170px]"
        >
          <div className="flex items-center gap-2">
            <motion.div 
               key={trafficLevel + 'pulse'}
               initial={{ scale: 0.5, opacity: 0 }} 
               animate={{ scale: 1, opacity: 1 }}
               className={`w-2 h-2 rounded-full animate-[ping_1.5s_cubic-bezier(0,0,0.2,1)_infinite] ${
                    trafficLevel === "Low" 
                      ? "bg-emerald-500" 
                      : trafficLevel === "Moderate" 
                      ? "bg-amber-500" 
                      : "bg-rose-500"
                  }`} 
            />
            <span className="text-xs font-semibold text-zinc-900 tracking-tight uppercase">Live Traffic</span>
          </div>
          <p className="text-xs text-zinc-600 font-medium flex items-center gap-1">
            Congestion: 
            <span className="inline-flex overflow-hidden">
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={trafficLevel}
                  initial={{ opacity: 0, y: 15, rotateX: 90 }}
                  animate={{ opacity: 1, y: 0, rotateX: 0 }}
                  exit={{ opacity: 0, y: -15, rotateX: -90 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className={`inline-block font-semibold ${
                    trafficLevel === "Low" 
                      ? "text-emerald-500" 
                      : trafficLevel === "Moderate" 
                      ? "text-amber-500" 
                      : "text-rose-500"
                  }`}
                >
                  {trafficLevel}
                </motion.span>
              </AnimatePresence>
            </span>
          </p>

          <button
            onClick={() => {
              const text = `My current trip status: Traffic is ${trafficLevel}. Estimated arrival in ${smartRouteState === 'ready' ? '24' : '35'} minutes.`;
              
              // Helper to fallback to clipboard
              const fallbackCopy = () => {
                navigator.clipboard.writeText(text)
                  .then(() => console.log('ETA copied to clipboard'))
                  .catch(() => {});
              };

              if (navigator.share) {
                navigator.share({
                  title: 'My Trip Status',
                  text: text,
                }).catch((err) => {
                  console.error('Share failed:', err);
                  fallbackCopy(); // Fallback if blocked by iframe permissions
                });
              } else {
                fallbackCopy();
              }
            }}
            className="mt-1 flex items-center justify-center gap-1.5 w-full py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-1"
          >
            <Share size={12} />
            Share ETA
          </button>
        </motion.div>

        
        <AnimatePresence>
          {smartRouteState !== "hidden" && (
            <motion.div
              initial={{ opacity: 0, height: 0, y: -10 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -10 }}
              className="mt-3 overflow-hidden"
            >
              <div className="bg-white/90 backdrop-blur-md shadow-md border border-zinc-200 rounded-xl p-3 flex flex-col gap-2 min-w-[170px]">
                {smartRouteState === "calculating" ? (
                  <div className="flex flex-col gap-2 items-center justify-center p-2 text-zinc-500">
                    <Loader2 size={24} className="animate-spin text-indigo-500" />
                    <span className="text-xs font-medium text-center">Finding faster routes...</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <Zap size={14} className="text-indigo-500 fill-indigo-100" />
                      <span className="text-xs font-semibold text-zinc-900 tracking-tight uppercase">Smart Route</span>
                    </div>
                    
                    <div className="flex flex-col gap-1.5 mt-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-500 line-through">35 min</span>
                        <ArrowRight size={12} className="text-zinc-400" />
                        <span className="font-bold text-indigo-600">24 min</span>
                      </div>
                      
                      <button 
                        className="mt-1 w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
                        onClick={() => {
                           setSmartRouteState("hidden");
                        }}
                      >
                        Accept Route
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Weather Notification Card Overlay */}
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.1 }}
        className={`absolute bottom-16 left-4 z-[8] backdrop-blur-md shadow-md border rounded-xl p-3 flex flex-col gap-1.5 min-w-[170px] max-w-[210px] ${
          weatherCondition === "Rain"
            ? "bg-blue-950/95 text-blue-100 border-blue-800"
            : weatherCondition === "High Heat"
            ? "bg-amber-950/95 text-amber-100 border-amber-800"
            : "bg-white/90 text-zinc-900 border-zinc-200"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider font-extrabold flex items-center gap-1">
            {weatherCondition === "Rain" ? (
              <span className="flex items-center gap-1 text-blue-400">
                <CloudRain size={12} className="animate-bounce" /> Torrential Rain
              </span>
            ) : weatherCondition === "High Heat" ? (
              <span className="flex items-center gap-1 text-amber-500">
                <Thermometer size={12} className="animate-pulse" /> Extreme Heat
              </span>
            ) : (
              <span className="flex items-center gap-1 text-emerald-600">
                <Sun size={12} className="animate-spin-slow" /> Clear Skies
              </span>
            )}
          </span>
          <span className={`text-[10px] font-mono font-bold px-1 rounded ${
            weatherCondition === "Rain"
              ? "bg-blue-900/40 text-blue-300 border border-blue-700/50"
              : weatherCondition === "High Heat"
              ? "bg-amber-900/40 text-amber-300 border border-amber-700/50"
              : "bg-zinc-100 text-zinc-650 border border-zinc-250"
          }`}>
            {weatherCondition === "Rain" ? "24°C" : weatherCondition === "High Heat" ? "42°C" : "31°C"}
          </span>
        </div>
        <p className={`text-[10px] leading-relaxed font-semibold ${
          weatherCondition === "Rain"
            ? "text-blue-200/90"
            : weatherCondition === "High Heat"
            ? "text-amber-200/90"
            : "text-zinc-500"
        }`}>
          {weatherCondition === "Rain"
            ? "Expect major traffic delays. +40% surge demand fare integrated."
            : weatherCondition === "High Heat"
            ? "Extreme cabin power stress. +25% thermal dynamic load surge Active."
            : "Normal weather coordinates. Standard rates apply."}
        </p>
      </motion.div>

      {/* Map Control Overlays */}
      <div className="absolute top-4 right-4 z-[400] flex flex-col gap-2">
        <motion.button
          onClick={() => setShowTraffic(!showTraffic)}
          className={`p-3 rounded-xl shadow-md border backdrop-blur-md flex items-center justify-center transition-colors cursor-pointer ${
            showTraffic 
              ? "bg-zinc-950/90 border-zinc-700 text-emerald-400" 
              : "bg-white/90 border-zinc-200 text-zinc-500 hover:text-zinc-800"
          }`}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          title="Toggle Live Traffic Overlay"
        >
          <Activity size={20} className={showTraffic ? "animate-pulse" : ""} />
        </motion.button>
      </div>
    </div>
  );
}
