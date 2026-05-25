import express from "express";
import path from "path";
import cors from "cors";
import { createServer as createViteServer } from "vite";
// GoogleGenAI loaded lazily in getGemini() to avoid crash when GEMINI_API_KEY is absent
import { Server } from "socket.io";
import { createServer } from "http";
import mongoose from "mongoose";
import { Ride, Driver, Message, User, WalletTransaction, FareBreakdown, PromoCode, LatLng } from "./src/types.js";
import { generateRouteCoordinates, findNearestNode } from "./src/utils/dijkstra.js";
import { connectDB } from "./src/services/db.js";
import { UserModel, DriverModel, RideModel, TransactionModel, MessageModel } from "./src/models/index.js";

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://glittering-sunflower-091e81.netlify.app',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
];

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  }
});

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true
}));
app.use(express.json());

async function initDefaultData() {
  const userCount = await UserModel.countDocuments();
  if (userCount === 0) {
    await UserModel.create({
      id: "rider_101",
      name: "Gautam Dev",
      email: "gautam.dev@example.com",
      phone: "+91 98765 43210",
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80",
      rating: 4.85,
      tripCount: 42,
      balance: 650,
      language: "English",
      emergencyContacts: [{ name: "Priya Dev (Sister)", phone: "+91 99887 76655" }],
      verified: true,
      role: 'rider'
    });
  }
}

// Remove old hardcoded fake drivers from DB on every start
async function clearFakeDrivers() {
  const result = await DriverModel.deleteMany({ id: { $in: ["driver_carlos", "driver_deepak"] } });
  if (result.deletedCount > 0) {
    console.log(`🧹 Cleared ${result.deletedCount} fake seed driver(s) from DB`);
  }
}

const PRESET_PLACES = [
  { name: "Indiranagar", address: "100 Feet Road, Indiranagar, Bengaluru", lat: 12.9784, lng: 77.6408 },
  { name: "Koramangala", address: "80 Feet Road, Koramangala, Bengaluru", lat: 12.9352, lng: 77.6245 },
  { name: "MG Road", address: "MG Road, Bengaluru", lat: 12.9716, lng: 77.5946 },
  { name: "HSR Layout", address: "Sector 1, HSR Layout, Bengaluru", lat: 12.9121, lng: 77.6446 },
  { name: "BTM Layout", address: "BTM Layout, Bengaluru", lat: 12.9166, lng: 77.6101 },
  { name: "Domlur", address: "Domlur, Bengaluru", lat: 12.9609, lng: 77.6387 },
  { name: "Marathahalli", address: "Marathahalli, Bengaluru", lat: 12.9569, lng: 77.7011 },
  { name: "Bellandur", address: "Bellandur, Bengaluru", lat: 12.9304, lng: 77.6784 },
  { name: "Whitefield", address: "Whitefield, Bengaluru", lat: 12.9698, lng: 77.7499 },
  { name: "Electronic City", address: "Electronic City Phase 1, Bengaluru", lat: 12.8399, lng: 77.6770 },
  { name: "Jayanagar", address: "4th Block, Jayanagar, Bengaluru", lat: 12.9252, lng: 77.5938 },
  { name: "Malleshwaram", address: "Malleshwaram, Bengaluru", lat: 13.0035, lng: 77.5706 },
  { name: "Yelahanka", address: "Yelahanka, Bengaluru", lat: 13.1007, lng: 77.5963 },
  { name: "KR Puram", address: "KR Puram, Bengaluru", lat: 13.0003, lng: 77.6947 },
  { name: "Banashankari", address: "Banashankari, Bengaluru", lat: 12.9253, lng: 77.5468 },
];

async function getRouteWithDistance(start: LatLng, end: LatLng): Promise<{ route: LatLng[], distanceKm: number, durationMin: number }> {
  // Try Valhalla (Mapbox's open source router, very reliable from India)
  try {
    const body = {
      locations: [
        { lon: start.lng, lat: start.lat },
        { lon: end.lng, lat: end.lat }
      ],
      costing: "auto",
      directions_options: { units: "km" }
    };
    const url = `https://valhalla1.openstreetmap.de/route`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json() as any;
      const leg = data.trip?.legs?.[0];
      if (leg?.shape) {
        // Valhalla uses encoded polyline
        const decoded = decodePolyline(leg.shape);
        const distKm = data.trip.summary.length;
        const durMin = Math.max(Math.ceil(data.trip.summary.time / 60), 2);
        console.log(`[Valhalla] Got ${decoded.length} points, ${distKm}km`);
        return { route: decoded, distanceKm: distKm, durationMin: durMin };
      }
    }
  } catch (e) {
    console.warn("[Valhalla] failed:", e);
  }

  // Try OSRM driving
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json() as any;
      const coords = data.routes?.[0]?.geometry?.coordinates;
      if (Array.isArray(coords) && coords.length > 2) {
        console.log(`[OSRM] Got ${coords.length} points`);
        return {
          route: coords.map((c: [number, number]) => ({ lat: c[1], lng: c[0] })),
          distanceKm: parseFloat((data.routes[0].distance / 1000).toFixed(2)),
          durationMin: Math.max(Math.ceil(data.routes[0].duration / 60), 2)
        };
      }
    }
  } catch (e) {
    console.warn("[OSRM] failed:", e);
  }

  console.warn("[Route] All APIs failed, using Dijkstra fallback");
  const fallbackRoute = generateRouteCoordinates(start, end);
  const fallbackDist = getDistanceKm(start.lat, start.lng, end.lat, end.lng);
  return {
    route: fallbackRoute,
    distanceKm: fallbackDist,
    durationMin: Math.max(Math.ceil(fallbackDist * 2.8), 4)
  };
}

// Decode Valhalla's encoded polyline (precision 6)
function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let shift = 0, result = 0, byte: number;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : result >> 1;
    points.push({ lat: lat / 1e6, lng: lng / 1e6 });
  }
  return points;
}

async function getRoute(start: LatLng, end: LatLng): Promise<LatLng[]> {
  const data = await getRouteWithDistance(start, end);
  return data.route;
}

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return parseFloat((R * c).toFixed(2));
}

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("driver:register", async (driverId) => {
    let driver = await DriverModel.findOne({ id: driverId });
    if (!driver) {
      driver = await DriverModel.create({
        id: driverId,
        name: "Test Driver",
        avatar: "",
        rating: 5,
        vehicle: { make: "Honda", model: "Civic", year: 2023, color: "White", plateNumber: "TEST1234" },
        isOnline: true,
        currentLocation: { lat: 12.9716, lng: 77.5946 }, // MG Road
        bearing: 0,
        earnings: { today: 0, weekly: 0, total: 0 },
        totalRides: 0,
        acceptanceRate: 100,
        status: "idle",
        socketId: socket.id
      });
    } else {
      await DriverModel.updateOne({ id: driverId }, { socketId: socket.id, isOnline: true });
    }
    console.log(`Driver registered: ${driverId} at ${socket.id}`);
  });

  socket.on("driver:location_update", async (data) => {
    await DriverModel.updateOne({ id: data.driverId }, {
      'currentLocation.lat': data.lat,
      'currentLocation.lng': data.lng,
      bearing: data.bearing
    });

    const activeRide = await RideModel.findOne({ driverId: data.driverId, status: { $in: ['accepted', 'arrived', 'in_progress'] } });
    if (activeRide) {
      io.to(`ride:${activeRide.id}`).emit("ride:location_update", {
        lat: data.lat,
        lng: data.lng,
        bearing: data.bearing
      });
    }
  });

  socket.on("rider:join_ride", (rideId) => {
    socket.join(`ride:${rideId}`);
  });

  socket.on("driver:accept_ride", async ({ driverId, rideId }) => {
    const activeRide = await RideModel.findOne({ id: rideId, status: "searching" });
    if (activeRide) {
      activeRide.driverId = driverId;
      activeRide.status = "accepted";
      activeRide.timeline.acceptedAt = new Date().toISOString();
      await activeRide.save();

      // Use updateOne to reliably set driver as busy
      await DriverModel.updateOne(
        { id: driverId },
        { status: "en_route", isOnline: true }
      );
      const driver = await DriverModel.findOne({ id: driverId });

      io.to(`ride:${rideId}`).emit("ride:status_update", { ride: activeRide, driver });
      socket.emit("driver:ride_confirmed", { ride: activeRide });
    }
  });

  socket.on("driver:arrived", async ({ rideId }) => {
    const activeRide = await RideModel.findOne({ id: rideId });
    if (activeRide) {
      activeRide.status = "arrived";
      activeRide.timeline.arrivedAt = new Date().toISOString();
      await activeRide.save();
      io.to(`ride:${rideId}`).emit("ride:status_update", { ride: activeRide });
    }
  });

  socket.on("driver:complete_trip", async ({ rideId }) => {
    const activeRide = await RideModel.findOne({ id: rideId });
    if (activeRide) {
      activeRide.status = "completed";
      activeRide.timeline.completedAt = new Date().toISOString();
      await activeRide.save();

      const driver = await DriverModel.findOne({ id: activeRide.driverId });
      if (driver) {
        driver.status = "idle";
        driver.earnings.today += activeRide.fare;
        driver.earnings.total += activeRide.fare;
        driver.totalRides += 1;
        await driver.save();
        socket.emit("driver:trip_completed", { rideId, earnings: activeRide.fare });
      }

      // Handle wallet deduction
      const user = await UserModel.findOne({ id: activeRide.riderId });
      if (user) {
        user.balance -= activeRide.fare;
        await user.save();

        await TransactionModel.create({
          id: `tx_${Date.now()}`,
          userId: user.id,
          type: 'debit',
          amount: activeRide.fare,
          date: new Date().toISOString(),
          description: `Ride ${rideId}`,
          status: 'completed'
        });
      }

      io.to(`ride:${rideId}`).emit("ride:status_update", { ride: activeRide });
    }
  });

  socket.on("driver:cancel_ride", async ({ rideId }) => {
    const activeRide = await RideModel.findOne({ id: rideId });
    if (activeRide && activeRide.driverId) {
      const driver = await DriverModel.findOne({ id: activeRide.driverId });
      if (driver) {
        driver.status = "idle";
        await driver.save();
      }

      activeRide.status = "searching";
      activeRide.driverId = "";
      await activeRide.save();

      io.to(`ride:${rideId}`).emit("ride:status_update", { ride: activeRide, driver: null, message: "Driver cancelled. Finding a new driver..." });

      const onlineDrivers = await DriverModel.find({ isOnline: true, id: { $ne: driver?.id } });
      onlineDrivers.forEach(d => {
        if (d.socketId) {
          io.to(d.socketId).emit("driver:new_ride_request", {
            rideId: activeRide.id,
            pickup: activeRide.pickup,
            drop: activeRide.drop,
            fare: activeRide.fare,
            rideType: activeRide.rideType,
            distanceKm: activeRide.distanceKm,
            riderId: activeRide.riderId
          });
        }
      });
    }
  });

  socket.on("disconnect", async () => {
    console.log("Client disconnected:", socket.id);
    await DriverModel.updateOne({ socketId: socket.id }, { isOnline: false });
  });
});

app.get("/api/user", async (req, res) => {
  const user = await UserModel.findOne({ id: "rider_101" });
  res.json({ user });
});

app.post("/api/user", async (req, res) => {
  const user = await UserModel.findOneAndUpdate({ id: "rider_101" }, req.body, { returnDocument: 'after' });
  res.json({ success: true, user });
});

app.post("/api/user/add_contact", async (req, res) => {
  const user = await UserModel.findOneAndUpdate(
    { id: "rider_101" },
    { $push: { emergencyContacts: req.body } },
    { returnDocument: 'after' }
  );
  res.json({ success: true, user });
});

app.post("/api/user/delete_contact", async (req, res) => {
  const user = await UserModel.findOneAndUpdate(
    { id: "rider_101" },
    { $pull: { emergencyContacts: { phone: req.body.phone } } },
    { returnDocument: 'after' }
  );
  res.json({ success: true, user });
});

app.post("/api/user/topup", async (req, res) => {
  const topupAmount = Number(req.body.amount);
  if (topupAmount > 0) {
    const user = await UserModel.findOneAndUpdate(
      { id: "rider_101" },
      { $inc: { balance: topupAmount } },
      { returnDocument: 'after' }
    );
    await TransactionModel.create({
      id: `tx_${Date.now()}`,
      userId: "rider_101",
      type: 'credit',
      amount: topupAmount,
      date: new Date().toISOString(),
      description: "Wallet Topup",
      status: 'completed'
    });
    const transactions = await TransactionModel.find({ userId: "rider_101" }).sort({ createdAt: -1 });
    res.json({ success: true, balance: user?.balance, transactions });
  } else {
    res.status(400).json({ error: "Invalid amount" });
  }
});

app.get("/api/user/wallet", async (req, res) => {
  const user = await UserModel.findOne({ id: "rider_101" });
  const transactions = await TransactionModel.find({ userId: "rider_101" }).sort({ createdAt: -1 });
  res.json({ balance: user?.balance || 0, transactions });
});

app.get("/api/places/search", async (req, res) => {
  const query = (req.query.q || "").toString().toLowerCase().trim();
  if (!query || query.length < 2) return res.json({ places: PRESET_PLACES.slice(0, 6) });

  const local = PRESET_PLACES.filter(p =>
    p.name.toLowerCase().includes(query) || p.address.toLowerCase().includes(query)
  );
  if (local.length >= 2) return res.json({ places: local });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + " Bengaluru")}&format=json&limit=5`,
      { headers: { "User-Agent": "GitaRide/1.0 (+support@gitaride.in)" }, signal: controller.signal }
    );
    clearTimeout(timer);
    if (geoRes.ok) {
      const data = await geoRes.json();
      if (Array.isArray(data) && data.length) {
        return res.json({
          places: data.map((item: any) => ({
            name: item.display_name.split(",")[0],
            address: item.display_name,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon)
          }))
        });
      }
    }
  } catch { }
  return res.json({ places: local.length ? local : PRESET_PLACES.slice(0, 5) });
});

// Driver location getter — rider polls this while status is "accepted"
app.get("/api/driver/location/:driverId", async (req, res) => {
  const driver = await DriverModel.findOne({ id: req.params.driverId });
  if (!driver) return res.status(404).json({ error: "Driver not found" });
  res.json({ location: driver.currentLocation });
});

app.post("/api/rides/estimate", async (req, res) => {
  const { pickup, drop } = req.body;
  if (!pickup || !drop) return res.status(400).json({ error: "Missing coordinates" });

  const routeData = await getRouteWithDistance(pickup, drop);
  console.log("[Estimate] Route points returned:", routeData.route.length);
  const distanceKm = routeData.distanceKm;
  const estimateMin = routeData.durationMin;

  const hour = new Date().getHours();
  let surgeMultiplier = 1.0;
  let surgeReason = "Normal pricing";
  if (hour >= 17 && hour <= 19) { surgeMultiplier = 1.35; surgeReason = "Evening rush"; }
  else if (hour >= 8 && hour <= 10) { surgeMultiplier = 1.25; surgeReason = "Morning rush"; }

  const rates = {
    economy: { base: 25, perKm: 8, perMin: 1, capacity: 4, eta: "4 min", name: "Economy Standard" },
    premium: { base: 50, perKm: 14, perMin: 2, capacity: 4, eta: "2 min", name: "Premium Black" },
    suv: { base: 75, perKm: 18, perMin: 2.5, capacity: 6, eta: "6 min", name: "Super SUV" },
    shared: { base: 20, perKm: 5, perMin: 0.8, capacity: 2, eta: "8 min", name: "UberShared" },
  };

  const estimates = (Object.keys(rates) as Array<keyof typeof rates>).map(t => {
    const spec = rates[t];
    const baseFare = spec.base;
    const distanceFare = parseFloat((spec.perKm * distanceKm).toFixed(2));
    const timeFare = parseFloat((spec.perMin * estimateMin).toFixed(2));
    const surgeFee = parseFloat(((baseFare + distanceFare + timeFare) * (surgeMultiplier - 1)).toFixed(2));
    const rawTotal = baseFare + distanceFare + timeFare + surgeFee;
    const discount = t === "shared" ? parseFloat((rawTotal * 0.25).toFixed(2)) : 0;
    const finalFare = Math.ceil(rawTotal - discount);
    return {
      id: `ride_${t}`,
      name: spec.name,
      rideType: t,
      capacity: spec.capacity,
      eta: spec.eta,
      surgeMultiplier: parseFloat(surgeMultiplier.toFixed(2)),
      surgeReason,
      fare: finalFare,
      breakdown: { baseFare, distanceFare, timeFare, surgeFee, discount, finalFare }
    };
  });

  res.json({
    distanceKm,
    durationMin: estimateMin,
    estimates,
    route: routeData.route
  });
});

app.post("/api/rides/book", async (req, res) => {
  const { pickup, drop, rideType, fare, breakdown, targetDriverId } = req.body;
  const activeRide = await RideModel.findOne({ riderId: "rider_101", status: { $in: ['searching', 'accepted', 'arrived', 'in_progress'] } });
  if (activeRide) return res.status(400).json({ error: "Another ride is active" });

  const routeData = await getRouteWithDistance(pickup, drop);
  const routePath = routeData.route;
  const rideId = `ride_${Date.now()}`;

  const newRide = await RideModel.create({
    id: rideId,
    riderId: "rider_101",
    driverId: "",
    status: "searching",
    rideType,
    pickup,
    drop,
    route: routePath,
    distanceKm: routeData.distanceKm,
    durationMin: routeData.durationMin,
    fare,
    tip: 0,
    breakdown,
    otp: Math.floor(1000 + Math.random() * 9000).toString(),
    paymentMethod: "Wallet",
    shareToken: "token123",
    timeline: { searchedAt: new Date().toISOString() }
  });

  await MessageModel.create({ id: `msg_${Date.now()}`, rideId, senderId: "system", senderName: "System", content: "Finding driver...", createdAt: new Date().toLocaleTimeString() });

  // If rider picked a specific driver from the nearby list, notify only them
  if (targetDriverId) {
    const d = await DriverModel.findOne({ id: targetDriverId, isOnline: true });
    if (d?.socketId) {
      io.to(d.socketId).emit("driver:new_ride_request", {
        rideId, pickup, drop, fare, rideType, distanceKm: newRide.distanceKm, riderId: newRide.riderId
      });
    }
  } else {
    // Otherwise broadcast to all available drivers
    const onlineDrivers = await DriverModel.find({ isOnline: true });
    onlineDrivers.forEach(d => {
      if (d.socketId) {
        io.to(d.socketId).emit("driver:new_ride_request", {
          rideId, pickup, drop, fare, rideType, distanceKm: newRide.distanceKm, riderId: newRide.riderId
        });
      }
    });
  }

  // Simulation Fallback
  setTimeout(async () => {
    const checkRide = await RideModel.findOne({ id: rideId });
    // Only auto-accept if it was a general search (no specific target driver)
    if (checkRide && checkRide.status === "searching" && !targetDriverId) {
      // Pick an available driver
      const drv = await DriverModel.findOne({ isOnline: true, status: "idle" }) || await DriverModel.findOne({ id: "driver_deepak" });
      if (drv) {
        checkRide.driverId = drv.id;
        checkRide.status = "accepted";
        checkRide.timeline.acceptedAt = new Date().toISOString();
        await checkRide.save();

        drv.status = "en_route";
        await drv.save();

        io.to(`ride:${rideId}`).emit("ride:status_update", { ride: checkRide, driver: drv });
        if (drv.socketId) {
          io.to(drv.socketId).emit("driver:ride_confirmed", { ride: checkRide });
        }
      }
    }
  }, 3500);

  res.json({ success: true, ride: newRide });
});

app.get("/api/rides/active", async (req, res) => {
  const activeRide = await RideModel.findOne({ riderId: "rider_101", status: { $in: ['searching', 'accepted', 'arrived', 'in_progress'] } });

  if (activeRide) {
    const rideAgeMs = Date.now() - new Date(activeRide.timeline.searchedAt || activeRide.createdAt).getTime();
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000; // 6 hours

    if (rideAgeMs > SIX_HOURS_MS) {
      console.warn(`[API] Stale active ride found for rider_101 (ID: ${activeRide.id}). Auto-cancelling.`);
      activeRide.status = "cancelled";
      activeRide.timeline.cancelledAt = new Date().toISOString();
      await activeRide.save();
      return res.json({ ride: null, driver: null }); // Return null for stale ride
    }
  }
  let currentDriver = null;
  if (activeRide && activeRide.driverId) {
    currentDriver = await DriverModel.findOne({ id: activeRide.driverId });
  }
  res.json({ ride: activeRide, driver: currentDriver });
});

app.post("/api/rides/cancel", async (req, res) => {
  const activeRide = await RideModel.findOne({ riderId: "rider_101", status: { $in: ['searching', 'accepted', 'arrived'] } });
  if (activeRide) {
    activeRide.status = "cancelled";
    await activeRide.save();

    if (activeRide.driverId) {
      const d = await DriverModel.findOne({ id: activeRide.driverId });
      if (d) {
        d.status = "idle";
        await d.save();
        if (d.socketId) io.to(d.socketId).emit("driver:ride_cancelled", { rideId: activeRide.id });
      }
    }
  }
  res.json({ success: true });
});

app.post("/api/rides/verify-otp", async (req, res) => {
  const activeRide = await RideModel.findOne({ riderId: "rider_101", status: "arrived" });
  if (activeRide && activeRide.otp === req.body.otp) {
    activeRide.status = "in_progress";
    activeRide.timeline.startedAt = new Date().toISOString();
    await activeRide.save();

    const d = await DriverModel.findOne({ id: activeRide.driverId });
    if (d) {
      d.status = "trip";
      await d.save();
      if (d.socketId) io.to(d.socketId).emit("driver:trip_started", { ride: activeRide });
    }
    io.to(`ride:${activeRide.id}`).emit("ride:status_update", { ride: activeRide });
    res.json({ success: true, ride: activeRide });
  } else {
    res.status(400).json({ error: "Invalid OTP" });
  }
});

app.post("/api/rides/tip", async (req, res) => {
  const { rideId, tip } = req.body;
  const tipAmount = Number(tip) || 0;
  if (tipAmount <= 0) return res.json({ success: true });

  // Save tip on the ride
  const ride = await RideModel.findOneAndUpdate(
    { id: rideId },
    { tip: tipAmount },
    { returnDocument: 'after' }
  );
  if (!ride) return res.status(404).json({ error: "Ride not found" });

  // Add tip to driver's earnings in MongoDB
  if (ride.driverId) {
    const driver = await DriverModel.findOne({ id: ride.driverId });
    if (driver) {
      driver.earnings.today = (driver.earnings.today || 0) + tipAmount;
      driver.earnings.total = (driver.earnings.total || 0) + tipAmount;
      driver.earnings.tips = (driver.earnings.tips || 0) + tipAmount;
      await driver.save();
      console.log(`[Tip] ₹${tipAmount} added to driver ${ride.driverId}. New total: ₹${driver.earnings.total}`);

      // Notify driver via socket using socketId stored in DB
      if (driver.socketId) {
        io.to(driver.socketId).emit("driver:tip_received", {
          rideId: ride.id,
          tip: tipAmount
        });
        console.log(`[Tip] Notified driver socket ${driver.socketId}`);
      }
    }
  }

  res.json({ success: true, tip: tipAmount });
});

app.get("/api/history", async (req, res) => {
  const history = await RideModel.find({ riderId: "rider_101", status: "completed" }).sort({ createdAt: -1 });
  res.json({ history });
});

app.get("/api/chat", async (req, res) => {
  const messages = await MessageModel.find({ rideId: req.query.rideId });
  res.json({ messages });
});

// Lazy Gemini init
let aiInstance: any = null;
async function getGemini() {
  if (!aiInstance) {
    const key = process.env.GEMINI_API_KEY;
    if (key) {
      try {
        const { GoogleGenAI } = await import("@google/genai");
        aiInstance = new GoogleGenAI({ apiKey: key });
      } catch (e) {
        console.error("Failed to initialize GoogleGenAI:", e);
      }
    }
  }
  return aiInstance;
}

app.post("/api/chat/send", async (req, res) => {
  const { rideId, content } = req.body;
  if (!rideId || !content) return res.status(400).json({ error: "Missing params" });

  const userMsg = await MessageModel.create({
    id: `msg_u_${Date.now()}`,
    rideId,
    senderId: "rider",
    senderName: "You",
    content,
    createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  });

  const ride = await RideModel.findOne({ id: rideId });
  const driver = ride?.driverId ? await DriverModel.findOne({ id: ride.driverId }) : null;
  const driverName = driver?.name || "Driver";

  const personalities: Record<string, string> = {
    driver_carlos: "Carlos is a friendly tech enthusiast who drives a Tesla and loves gadgets. Uses emoji occasionally.",
    driver_deepak: "Deepak is humble, safety-focused, polite, and brief in his replies.",
    driver_sania: "Sania is high-energy, warm, and always helpful. Adds encouraging remarks.",
    driver_marcus: "Marcus is a formal premium chauffeur. Calls riders Sir or Madam. Professional and precise."
  };
  const personality = driver ? (personalities[driver.id] || `${driverName} is a friendly professional driver.`) : "You are a helpful rideshare driver.";

  const recent = await MessageModel.find({ rideId }).sort({ createdAt: -1 }).limit(6);
  const history = recent.reverse().map((m: any) => `${m.senderName}: ${m.content}`).join("\n");

  let replyContent = "On my way! Be there soon.";
  try {
    const ai = await getGemini();
    if (ai) {
      const result = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: `${history}\n${driverName}:`,
        config: {
          systemInstruction: `You are driver ${driverName}. ${personality} Keep it 1-2 sentences. No markdown. No asterisks.`,
          temperature: 0.8
        }
      });
      replyContent = result.text?.trim() || replyContent;
    }
  } catch { }

  const driverMsg = await MessageModel.create({
    id: `msg_d_${Date.now()}`,
    rideId,
    senderId: "driver",
    senderName: driverName,
    content: replyContent,
    createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  });

  const allMessages = await MessageModel.find({ rideId }).sort({ createdAt: 1 });
  io.to(`ride:${rideId}`).emit("chat:message", driverMsg);
  res.json({ messages: allMessages });
});

app.post("/api/rides/rate", async (req, res) => {
  const { rideId, stars, comment } = req.body;
  const ride = await RideModel.findOne({ id: rideId });
  if (!ride) return res.status(404).json({ error: "Ride not found" });
  (ride as any).ratings = { stars: Number(stars) || 5, comment: comment || "" };
  await ride.save();
  res.json({ success: true, ride });
});

app.post("/api/safety/sos", async (req, res) => {
  const ride = await RideModel.findOne({ riderId: "rider_101", status: { $in: ["accepted", "arrived", "in_progress"] } });
  const user = await UserModel.findOne({ id: "rider_101" });
  if (!ride) return res.status(400).json({ error: "No active ride" });

  await MessageModel.create({
    id: `msg_sos_${Date.now()}`,
    rideId: ride.id,
    senderId: "system",
    senderName: "EMERGENCY",
    content: "🚨 SOS activated. Emergency contacts have been alerted. Police notified.",
    createdAt: new Date().toLocaleTimeString()
  });

  io.to(`ride:${ride.id}`).emit("ride:sos", { rideId: ride.id });
  res.json({ success: true, alertedContacts: user?.emergencyContacts || [] });
});

app.get("/api/driver/profile/:userId", async (req, res) => {
  try {
    const driver = await DriverModel.findOne({ id: req.params.userId });
    res.json({ exists: !!driver, driver: driver || null });
  } catch (e) {
    res.status(500).json({ exists: false, driver: null });
  }
});

app.get("/api/driver/:driverId", async (req, res) => {
  try {
    const driver = await DriverModel.findOne({ id: req.params.driverId });
    res.json({ driver: driver || null });
  } catch (e) {
    res.status(500).json({ driver: null });
  }
});

app.post("/api/driver/profile", async (req, res) => {
  try {
    const { userId, name, phone, vehicle } = req.body;
    if (!userId || !name || !vehicle?.make || !vehicle?.plateNumber) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const existing = await DriverModel.findOne({ id: userId });
    if (existing) {
      existing.name = name;
      if (phone) existing.phone = phone;
      existing.vehicle = { ...(existing.vehicle.toObject?.() || existing.vehicle), ...vehicle };
      if (req.body.location) {
        existing.currentLocation = req.body.location;
      }
      existing.isOnline = true;
      existing.status = "idle";
      await existing.save();
      return res.json({ success: true, driver: existing });
    }

    const driver = await DriverModel.create({
      id: userId,
      name,
      phone: phone || "",
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=16a34a&color=fff&size=200`,
      rating: 5.0,
      vehicle: {
        make: vehicle.make,
        model: vehicle.model || "",
        year: parseInt(vehicle.year) || new Date().getFullYear(),
        color: vehicle.color || "White",
        plateNumber: vehicle.plateNumber.toString().toUpperCase()
      },
      isOnline: true,
      currentLocation: {
        lat: req.body.location?.lat || 12.9716,
        lng: req.body.location?.lng || 77.5946
      },
      bearing: 0,
      earnings: { today: 0, weekly: 0, total: 0 },
      totalRides: 0,
      acceptanceRate: 100,
      status: "idle"
    });

    res.json({ success: true, driver });
  } catch (e: any) {
    console.error("Driver profile error:", e.message);
    res.status(500).json({ error: "Server error: " + e.message });
  }
});

app.post("/api/driver/location", async (req, res) => {
  const { driverId, lat, lng } = req.body;
  if (!driverId || !lat || !lng) return res.status(400).json({ error: "Missing params" });
  await DriverModel.updateOne(
    { id: driverId },
    { currentLocation: { lat, lng }, isOnline: true, status: "idle" }
  );
  res.json({ success: true });
});

app.post("/api/drivers/nearby", async (req, res) => {
  const { pickup } = req.body;
  if (!pickup) return res.status(400).json({ error: "Missing pickup" });

  // Find driver IDs who currently have an active ride
  const activeRides = await RideModel.find({
    status: { $in: ["accepted", "arrived", "in_progress"] },
    driverId: { $ne: "" }
  });
  const busyDriverIds = activeRides.map(r => r.driverId).filter(Boolean);

  const drivers = await DriverModel.find({
    isOnline: true,
    status: "idle",
    id: { $nin: busyDriverIds }
  });

  console.log(`[nearby] Busy drivers: ${busyDriverIds.length}, Available: ${drivers.length}`);

  const withDistance = drivers
    .filter(d => d.currentLocation?.lat && d.currentLocation?.lng)
    .map(d => {
      const distKm = getDistanceKm(pickup.lat, pickup.lng, d.currentLocation.lat, d.currentLocation.lng);
      const etaMin = Math.max(Math.ceil(distKm * 3), 2);
      return {
        id: d.id,
        name: d.name,
        avatar: d.avatar,
        rating: d.rating,
        vehicle: d.vehicle,
        currentLocation: d.currentLocation,
        distanceKm: parseFloat(distKm.toFixed(1)),
        etaMin,
        totalRides: d.totalRides,
        socketId: d.socketId
      };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);

  console.log(`[nearby] Found ${withDistance.length} online+idle driver(s) near pickup`);
  res.json({ drivers: withDistance });
});

app.post("/api/driver/offline", async (req, res) => {
  const { driverId } = req.body;
  if (!driverId) return res.status(400).json({ error: "Missing driverId" });
  await DriverModel.updateOne(
    { id: driverId },
    { isOnline: false, status: "idle", socketId: "" }
  );
  res.json({ success: true });
});

app.get("/api/test-osrm", async (req, res) => {
  const startCoords = { lat: 12.9784, lng: 77.6408 }; // Indiranagar
  const endCoords = { lat: 12.9352, lng: 77.6245 }; // Koramangala
  try {
    const routeData = await getRouteWithDistance(startCoords, endCoords);
    res.json({ success: true, routeData });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

async function start() {
  try {
    if (!process.env.MONGODB_URI) {
      console.warn("⚠️ MONGODB_URI is not defined in .env file. Database features will be unavailable.");
    } else {
      await connectDB();
      console.log("✅ Successfully connected to MongoDB");
    }

    // CRITICAL: Reset all drivers to offline on startup. 
    // This must happen AFTER connection to avoid buffering timeouts.
    await DriverModel.updateMany({}, { isOnline: false, socketId: "" });

    await initDefaultData();
    // Commented out to keep demo drivers available for local testing
    // await clearFakeDrivers();
  } catch (dbErr: any) {
    console.error("❌ Database initialization failed:", dbErr.message || dbErr);
  }

  try {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } catch (err) {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, () => {
    console.log(`🚀 SmartRideShare Backend + Socket.io running on http://localhost:${PORT}`);
  });
}
start();
