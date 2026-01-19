const mongoose = require('mongoose');

const appointmentInvitationSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  appointmentDate: {
    type: Date,
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending'
  }
}, { timestamps: true });

// Index for efficient querying
appointmentInvitationSchema.index({ doctor: 1, status: 1 });
appointmentInvitationSchema.index({ patient: 1, status: 1 });

module.exports = mongoose.model('AppointmentInvitation', appointmentInvitationSchema);
