import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String },
  avatar: { type: String },
  rating: { type: Number, default: 5 },
  tripCount: { type: Number, default: 0 },
  balance: { type: Number, default: 0 },
  language: { type: String, default: 'English' },
  emergencyContacts: [{ name: String, phone: String }],
  verified: { type: Boolean, default: false },
  role: { type: String, enum: ['rider', 'driver'], default: 'rider' }
}, { timestamps: true });

export const UserModel = mongoose.models.User || mongoose.model<any>('User', userSchema);

const driverSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  avatar: { type: String },
  rating: { type: Number, default: 5 },
  vehicle: {
    make: String,
    model: String,
    year: Number,
    color: String,
    plateNumber: String
  },
  isOnline: { type: Boolean, default: false },
  currentLocation: {
    lat: Number,
    lng: Number
  },
  bearing: { type: Number, default: 0 },
  earnings: {
    today: { type: Number, default: 0 },
    weekly: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    tips: { type: Number, default: 0 }
  },
  totalRides: { type: Number, default: 0 },
  acceptanceRate: { type: Number, default: 100 },
  status: { type: String, default: 'idle' },
  socketId: { type: String }
}, { timestamps: true });

export const DriverModel = mongoose.models.Driver || mongoose.model<any>('Driver', driverSchema);

const rideSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  riderId: { type: String, required: true },
  driverId: { type: String },
  status: { type: String, required: true },
  rideType: { type: String, required: true },
  pickup: { lat: Number, lng: Number },
  drop: { lat: Number, lng: Number },
  route: [{ lat: Number, lng: Number }],
  distanceKm: { type: Number, required: true },
  durationMin: { type: Number, required: true },
  fare: { type: Number, required: true },
  tip: { type: Number, default: 0 },
  breakdown: {
    baseFare: Number,
    distanceFare: Number,
    timeFare: Number,
    surgeFee: Number,
    discount: Number,
    finalFare: Number
  },
  otp: { type: String },
  paymentMethod: { type: String },
  shareToken: { type: String },
  timeline: {
    searchedAt: String,
    acceptedAt: String,
    arrivedAt: String,
    startedAt: String,
    completedAt: String
  }
}, { timestamps: true });

export const RideModel = mongoose.models.Ride || mongoose.model<any>('Ride', rideSchema);

const txSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String }, // Which user owns this transaction
  type: { type: String, enum: ['credit', 'debit'] },
  amount: { type: Number, required: true },
  date: { type: String, required: true },
  description: { type: String },
  status: { type: String, enum: ['completed', 'pending', 'failed'] }
}, { timestamps: true });

export const TransactionModel = mongoose.models.Transaction || mongoose.model<any>('Transaction', txSchema);

const msgSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  rideId: { type: String, required: true },
  senderId: { type: String, required: true },
  senderName: { type: String },
  content: { type: String, required: true },
  createdAt: { type: String }
}, { timestamps: true });

export const MessageModel = mongoose.models.Message || mongoose.model<any>('Message', msgSchema);
