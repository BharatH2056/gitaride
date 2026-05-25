export interface LatLng {
  lat: number;
  lng: number;
}

export interface Vehicle {
  make: string;
  model: string;
  year: number;
  color: string;
  plateNumber: string;
}

// Role added to User
export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  rating: number;
  tripCount: number;
  balance: number;
  language: string;
  emergencyContacts: { name: string; phone: string }[];
  verified: boolean;
  role: 'rider' | 'driver'; // NEW
}

// Driver now has socketId for real-time connection
export interface Driver {
  id: string;
  name: string;
  avatar: string;
  rating: number;
  vehicle: Vehicle;
  isOnline: boolean;
  currentLocation: LatLng;
  bearing: number;
  earnings: {
    today: number;
    weekly: number;
    total: number;
  };
  totalRides: number;
  acceptanceRate: number;
  status: 'idle' | 'en_route' | 'arrived' | 'trip';
  socketId?: string; // NEW — tracks which socket this driver is connected on
}

export interface FareBreakdown {
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  surgeFee: number;
  discount: number;
  finalFare: number;
}

export interface Ride {
  id: string;
  riderId: string;
  driverId: string | null;
  status: 'searching' | 'accepted' | 'driver_en_route' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';
  rideType: 'economy' | 'premium' | 'shared' | 'suv';
  pickup: {
    address: string;
    lat: number;
    lng: number;
  };
  drop: {
    address: string;
    lat: number;
    lng: number;
  };
  route: LatLng[];
  distanceKm: number;
  durationMin: number;
  fare: number;
  tip?: number;
  breakdown: FareBreakdown;
  otp: string;
  paymentMethod: string;
  shareToken: string;
  createdAt: string;
  timeline: {
    searchedAt?: string;
    acceptedAt?: string;
    arrivedAt?: string;
    startedAt?: string;
    completedAt?: string;
    cancelledAt?: string;
  };
  ratings?: {
    stars: number;
    comment: string;
  };
}

export interface WalletTransaction {
  id: string;
  type: 'ride' | 'topup' | 'refund' | 'referral' | 'promo';
  amount: number;
  title: string;
  date: string;
  status: 'completed' | 'pending' | 'failed';
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: string;
}

export interface PromoCode {
  code: string;
  discountType: 'flat' | 'percent';
  value: number;
  expiry: string;
}
