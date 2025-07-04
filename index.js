import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import authRoutes from './src/routes/authRoutes.js';
import profileRoutes from './src/routes/profileRoutes.js';
import threadRoutes from './src/routes/threadRoutes.js';
import errorConverter from './src/middlewares/errorConverter.js';
import errorHandler from './src/middlewares/errorHandler.js';
import AppError from './src/utils/appError.js';
import connectDB from './src/utils/db.js';
import cookieParser from 'cookie-parser';


connectDB();

const app = express();
app.use(helmet());
app.use(cors(
  {
    origin: [
      process.env.CLIENT_URL,
      'http://localhost:5173',
      'http://localhost:5174',
    ],
    credentials: true,
  }
));
app.use(morgan('dev'));
app.use(cookieParser());
app.use(express.json());


app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/profile', profileRoutes);
app.use('/api/v1/thread', threadRoutes);

app.use('/', (req, res) => {
  res.status(200).json({ message: 'Welcome to the API', status: 'success', admin: true, version: '1.0.0' });
});


app.use((req, res, next) => {
  if (!res.headersSent) {
    next(new AppError(`Route not found: ${req.originalUrl}`, 404));
  } else {
    next();
  }
});


app.use(errorConverter);
app.use(errorHandler);



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});