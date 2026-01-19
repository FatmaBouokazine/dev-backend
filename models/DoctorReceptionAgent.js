const mongoose = require('mongoose');

const doctorReceptionAgentSchema = new mongoose.Schema({
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receptionAgent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending'
  }
}, {
  timestamps: true
});

// Ensure unique doctor-receptionAgent pairs
doctorReceptionAgentSchema.index({ doctor: 1, receptionAgent: 1 }, { unique: true });

module.exports = mongoose.model('DoctorReceptionAgent', doctorReceptionAgentSchema);
