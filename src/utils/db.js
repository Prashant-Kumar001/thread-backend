import mongoose from 'mongoose';
import { MONGO_URI } from '../config/index.js';

const connectDB = async () => {
  try {
    if (!MONGO_URI) throw new Error('MONGO_URI is not defined in environment variables.');
    mongoose.set('strictQuery', true);
    const conn = await mongoose.connect(MONGO_URI);

    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
    console.log(`MongoDB connected at ${conn.connection.host}`);
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1); 
  }
};

export default connectDB;
