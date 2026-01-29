require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// Import routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const doctorRoutes = require('./routes/doctor');
const medicalRecordsRoutes = require('./routes/medicalRecords');
const notificationsRoutes = require('./routes/notifications');
const receptionAgentsRoutes = require('./routes/receptionAgents');
const appointmentInvitationsRoutes = require('./routes/appointmentInvitations');
const healthAssessmentRoutes = require('./routes/healthAssessment');
const client = require("prom-client");


const app = express();
// Collect default Node.js metrics (CPU, memory, etc.)
client.collectDefaultMetrics();

// Add HTTP request duration metric
const httpRequestDurationSeconds = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status"],
});

// Middleware
app.use(cors());
app.use(express.json());

// Middleware to track HTTP requests
app.use((req, res, next) => {
  const end = httpRequestDurationSeconds.startTimer();

  res.on("finish", () => {
    end({
      method: req.method,
      route: req.path,
      status: res.statusCode,
    });
  });

  next();
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/medflow', {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
.then(() => console.log('MongoDB connected successfully'))
.catch(err => {
  console.error('MongoDB connection error:', err.message);
  console.log('Falling back to local MongoDB...');
});

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/medical-records', medicalRecordsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/reception-agents', receptionAgentsRoutes);
app.use('/api/appointment-invitations', appointmentInvitationsRoutes);
app.use('/api/health-assessment', healthAssessmentRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Medflow API is running' });
});

// Metrics endpoint
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

// 404 handler - must be after all other routes
app.use((req, res, next) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error(error.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});