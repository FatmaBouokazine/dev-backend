const express = require('express');
const router = express.Router();
const User = require('../models/User');
const AppointmentInvitation = require('../models/AppointmentInvitation');
const DoctorRequest = require('../models/DoctorRequest');
const MedicalRecord = require('../models/MedicalRecord');
const { authMiddleware } = require('../middleware/auth');
const { createNotification } = require('../services/notificationService');

// Middleware to check if user is a patient
const patientMiddleware = (req, res, next) => {
  if (req.user.role !== 'Patient') {
    return res.status(403).json({ message: 'Access denied. Patient role required.' });
  }
  next();
};

// Middleware to check if user is a doctor
const doctorMiddleware = (req, res, next) => {
  if (req.user.role !== 'Doctor') {
    return res.status(403).json({ message: 'Access denied. Doctor role required.' });
  }
  next();
};

// Get all doctors (for patients to send invitations)
router.get('/doctors/all', authMiddleware, patientMiddleware, async (req, res) => {
  try {
    const doctors = await User.find({ role: 'Doctor' })
      .select('name familyName email specialization')
      .sort({ name: 1 });
    
    // Get existing invitations from this patient
    const existingInvitations = await AppointmentInvitation.find({ 
      patient: req.user.userId 
    }).select('doctor status createdAt')
    .sort({ createdAt: -1 });
    
    const invitationMap = {};
    existingInvitations.forEach(invitation => {
      // Only keep the latest status for each doctor
      if (!invitationMap[invitation.doctor.toString()]) {
        invitationMap[invitation.doctor.toString()] = invitation.status;
      }
    });
    
    // Check if already connected via DoctorRequest
    const existingConnections = await DoctorRequest.find({
      patient: req.user.userId,
      status: 'accepted'
    }).select('doctor');
    
    const connectionSet = new Set(existingConnections.map(c => c.doctor.toString()));
    
    const doctorsWithStatus = doctors.map(doctor => ({
      _id: doctor._id,
      name: doctor.name,
      familyName: doctor.familyName,
      email: doctor.email,
      specialization: doctor.specialization,
      invitationStatus: invitationMap[doctor._id.toString()] || 'none',
      isConnected: connectionSet.has(doctor._id.toString())
    }));
    
    res.json(doctorsWithStatus);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Send appointment invitation to doctor (patient)
router.post('/send', authMiddleware, patientMiddleware, async (req, res) => {
  try {
    const { doctorId, appointmentDate, reason } = req.body;
    
    if (!doctorId || !appointmentDate || !reason) {
      return res.status(400).json({ message: 'Doctor ID, appointment date, and reason are required' });
    }
    
    // Check if doctor exists
    const doctor = await User.findOne({ _id: doctorId, role: 'Doctor' });
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }
    
    // Create new invitation
    const invitation = new AppointmentInvitation({
      patient: req.user.userId,
      doctor: doctorId,
      appointmentDate,
      reason
    });
    
    await invitation.save();
    
    // Send notification to doctor
    const patient = await User.findById(req.user.userId).select('name familyName');
    await createNotification({
      recipient: doctorId,
      sender: req.user.userId,
      type: 'appointment_invitation',
      title: 'New Appointment Invitation',
      message: `${patient.name} ${patient.familyName} has sent you an appointment invitation for ${new Date(appointmentDate).toLocaleDateString()}`,
      link: '/dashboard/appointment-invitations'
    });
    
    res.status(201).json({ 
      message: 'Appointment invitation sent successfully',
      invitation
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get appointment invitations for patient
router.get('/my-invitations', authMiddleware, patientMiddleware, async (req, res) => {
  try {
    const invitations = await AppointmentInvitation.find({ patient: req.user.userId })
      .populate('doctor', 'name familyName email specialization')
      .sort({ createdAt: -1 });
    
    res.json(invitations);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get pending appointment invitations for doctor
router.get('/pending', authMiddleware, doctorMiddleware, async (req, res) => {
  try {
    const invitations = await AppointmentInvitation.find({ 
      doctor: req.user.userId,
      status: 'pending'
    })
      .populate('patient', 'name familyName email')
      .sort({ appointmentDate: 1 });
    
    res.json(invitations);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all appointment invitations for doctor
router.get('/all', authMiddleware, doctorMiddleware, async (req, res) => {
  try {
    const invitations = await AppointmentInvitation.find({ 
      doctor: req.user.userId
    })
      .populate('patient', 'name familyName email')
      .sort({ createdAt: -1 });
    
    res.json(invitations);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Accept/Reject appointment invitation (doctor)
router.put('/:invitationId', authMiddleware, doctorMiddleware, async (req, res) => {
  try {
    const { invitationId } = req.params;
    const { status } = req.body;
    
    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    
    const invitation = await AppointmentInvitation.findOne({
      _id: invitationId,
      doctor: req.user.userId
    });
    
    if (!invitation) {
      return res.status(404).json({ message: 'Invitation not found' });
    }
    
    if (invitation.status !== 'pending') {
      return res.status(400).json({ message: 'Invitation already processed' });
    }
    
    invitation.status = status;
    await invitation.save();
    
    const doctor = await User.findById(req.user.userId).select('name familyName');
    
    if (status === 'accepted') {
      // Check if DoctorRequest already exists
      let doctorRequest = await DoctorRequest.findOne({
        doctor: req.user.userId,
        patient: invitation.patient
      });
      
      if (!doctorRequest) {
        // Create new DoctorRequest relationship
        doctorRequest = new DoctorRequest({
          doctor: req.user.userId,
          patient: invitation.patient,
          status: 'accepted'
        });
        await doctorRequest.save();
      } else if (doctorRequest.status !== 'accepted') {
        // Update existing request to accepted
        doctorRequest.status = 'accepted';
        await doctorRequest.save();
      }
      
      // Get or create medical record for the patient
      let medicalRecord = await MedicalRecord.findOne({ patient: invitation.patient });
      
      if (!medicalRecord) {
        medicalRecord = new MedicalRecord({
          patient: invitation.patient,
          appointments: [],
          prescriptions: [],
          diseases: [],
          diagnostics: [],
          comments: []
        });
        await medicalRecord.save();
      }
      
      // Add appointment to medical record
      medicalRecord.appointments.push({
        doctor: req.user.userId,
        date: invitation.appointmentDate,
        reason: invitation.reason
      });
      await medicalRecord.save();
      
      // Notify patient
      await createNotification({
        recipient: invitation.patient,
        sender: req.user.userId,
        type: 'appointment_accepted',
        title: 'Appointment Invitation Accepted',
        message: `Dr. ${doctor.name} ${doctor.familyName} has accepted your appointment invitation for ${new Date(invitation.appointmentDate).toLocaleDateString()}`,
        link: '/dashboard/medical-record'
      });
    } else {
      // Notify patient of rejection
      await createNotification({
        recipient: invitation.patient,
        sender: req.user.userId,
        type: 'appointment_rejected',
        title: 'Appointment Invitation Declined',
        message: `Dr. ${doctor.name} ${doctor.familyName} has declined your appointment invitation`,
        link: '/dashboard/appointment-invitations'
      });
    }
    
    res.json({ 
      message: `Invitation ${status}`,
      invitation
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
