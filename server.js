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

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/medflow')
.then(() => console.log('MongoDB connected'))
.catch(err => console.log(err));

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/medical-records', medicalRecordsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/reception-agents', receptionAgentsRoutes);
app.use('/api/appointment-invitations', appointmentInvitationsRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Medflow API is running' });
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