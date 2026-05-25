import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

// Load .env for local development (no-op if vars already set by Render)
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || '';

export async function connectDB() {
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is not set. Check your .env or Render environment variables.');
    return;
  }
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Successfully connected to MongoDB');
  } catch (error) {
    console.error('❌ Error connecting to MongoDB:', error);
  }
}
