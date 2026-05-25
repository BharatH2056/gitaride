import { describe, it, expect, vi, beforeEach } from 'vitest';
import { completeTripLogic, autoRematchLogic } from '../src/services/RideActions.js';
import { RideModel, DriverModel, UserModel, TransactionModel } from '../src/models/index.js';

vi.mock('../src/models/index.js', () => {
  return {
    RideModel: {
      findOne: vi.fn(),
    },
    DriverModel: {
      findOne: vi.fn(),
      find: vi.fn(),
    },
    UserModel: {
      findOne: vi.fn(),
    },
    TransactionModel: {
      create: vi.fn(),
    }
  };
});

describe('RideActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('completeTripLogic', () => {
    it('should complete a trip, update driver earnings, and deduct rider wallet', async () => {
      // Mock data
      const mockRide = {
        id: 'ride_123',
        status: 'in_progress',
        driverId: 'driver_1',
        riderId: 'rider_1',
        fare: 150,
        timeline: { completedAt: null },
        save: vi.fn().mockResolvedValue(true)
      };

      const mockDriver = {
        id: 'driver_1',
        status: 'trip',
        earnings: { today: 100, weekly: 500, total: 2000 },
        totalRides: 10,
        save: vi.fn().mockResolvedValue(true)
      };

      const mockUser = {
        id: 'rider_1',
        balance: 500,
        save: vi.fn().mockResolvedValue(true)
      };

      vi.mocked(RideModel.findOne).mockResolvedValue(mockRide as any);
      vi.mocked(DriverModel.findOne).mockResolvedValue(mockDriver as any);
      vi.mocked(UserModel.findOne).mockResolvedValue(mockUser as any);
      vi.mocked(TransactionModel.create).mockResolvedValue(true as any);

      const result = await completeTripLogic('ride_123');

      expect(mockRide.status).toBe('completed');
      expect(mockRide.timeline.completedAt).toBeDefined();
      expect(mockRide.save).toHaveBeenCalled();

      expect(mockDriver.status).toBe('idle');
      expect(mockDriver.earnings.today).toBe(250); // 100 + 150
      expect(mockDriver.totalRides).toBe(11);
      expect(mockDriver.save).toHaveBeenCalled();

      expect(mockUser.balance).toBe(350); // 500 - 150
      expect(mockUser.save).toHaveBeenCalled();

      expect(TransactionModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'rider_1',
          type: 'debit',
          amount: 150,
          status: 'completed'
        })
      );

      expect(result.driverEarnings).toBe(150);
      expect(result.userBalance).toBe(350);
    });

    it('should throw error if ride is not found', async () => {
      vi.mocked(RideModel.findOne).mockResolvedValue(null);
      await expect(completeTripLogic('invalid')).rejects.toThrow("Ride not found");
    });
  });

  describe('autoRematchLogic', () => {
    it('should set ride status to searching and find other online drivers', async () => {
      const mockRide = {
        id: 'ride_123',
        status: 'accepted',
        driverId: 'driver_1',
        save: vi.fn().mockResolvedValue(true)
      };

      const mockDriver = {
        id: 'driver_1',
        status: 'en_route',
        save: vi.fn().mockResolvedValue(true)
      };

      const mockOnlineDrivers = [
        { id: 'driver_2', isOnline: true },
        { id: 'driver_3', isOnline: true }
      ];

      vi.mocked(RideModel.findOne).mockResolvedValue(mockRide as any);
      vi.mocked(DriverModel.findOne).mockResolvedValue(mockDriver as any);
      vi.mocked(DriverModel.find).mockResolvedValue(mockOnlineDrivers as any);

      const result = await autoRematchLogic('ride_123');

      expect(mockDriver.status).toBe('idle');
      expect(mockDriver.save).toHaveBeenCalled();

      expect(mockRide.status).toBe('searching');
      expect(mockRide.driverId).toBe('');
      expect(mockRide.save).toHaveBeenCalled();

      expect(DriverModel.find).toHaveBeenCalledWith({
        isOnline: true,
        id: { $ne: 'driver_1' }
      });

      expect(result.onlineDrivers).toEqual(mockOnlineDrivers);
    });
  });
});
