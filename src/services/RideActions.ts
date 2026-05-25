import { RideModel, DriverModel, UserModel, TransactionModel } from '../models/index.js';

export async function completeTripLogic(rideId: string) {
  const activeRide = await RideModel.findOne({ id: rideId } as any);
  if (!activeRide) throw new Error("Ride not found");

  activeRide.status = "completed";
  activeRide.timeline.completedAt = new Date().toISOString();
  await activeRide.save();

  let driverEarnings = 0;
  const driver = await DriverModel.findOne({ id: activeRide.driverId } as any);
  if (driver) {
    driver.status = "idle";
    driver.earnings.today += activeRide.fare;
    driver.earnings.total += activeRide.fare;
    driver.totalRides += 1;
    await driver.save();
    driverEarnings = activeRide.fare;
  }

  // Handle wallet deduction
  const user = await UserModel.findOne({ id: activeRide.riderId } as any);
  if (user) {
    user.balance -= activeRide.fare;
    await user.save();
    
    await TransactionModel.create({
      id: `tx_${Date.now()}_${Math.random()}`,
      userId: user.id,
      type: 'debit',
      amount: activeRide.fare,
      date: new Date().toISOString(),
      description: `Ride ${rideId}`,
      status: 'completed'
    });
  }

  return { activeRide, driverEarnings, userBalance: user ? user.balance : null };
}

export async function autoRematchLogic(rideId: string) {
  const activeRide = await RideModel.findOne({ id: rideId } as any);
  if (!activeRide) throw new Error("Ride not found");

  const previousDriverId = activeRide.driverId;

  if (previousDriverId) {
    const driver = await DriverModel.findOne({ id: previousDriverId } as any);
    if (driver) {
      driver.status = "idle";
      await driver.save();
    }
  }
  
  activeRide.status = "searching";
  activeRide.driverId = "";
  await activeRide.save();

  // Find other online drivers
  const onlineDrivers = await DriverModel.find({ isOnline: true, id: { $ne: previousDriverId } } as any);
  
  return { activeRide, onlineDrivers };
}
