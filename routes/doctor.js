const express = require('express');
const router = express.Router();
const User = require('../models/User');
const DoctorRequest = require('../models/DoctorRequest');
const MedicalRecord = require('../models/MedicalRecord');
const { authMiddleware } = require('../middleware/auth');
const { notifyDoctorRequest, notifyRequestAccepted, notifyRequestRejected } = require('../services/notificationService');

// Middleware to check if user is a doctor
const doctorMiddleware = (req, res, next) => {
  if (req.user.role !== 'Doctor') {
    return res.status(403).json({ message: 'Access denied. Doctor role required.' });
  }
  next();
};

// Get doctor statistics
router.get('/statistics', authMiddleware, doctorMiddleware, async (req, res) => {
  try {
    // Get total patients
    const totalPatients = await DoctorRequest.countDocuments({
      doctor: req.user.userId,
      status: 'accepted'
    });

    // Get pending requests
    const pendingRequests = await DoctorRequest.countDocuments({
      doctor: req.user.userId,
      status: 'pending'
    });

    // Get all accepted patient IDs
    const acceptedRequests = await DoctorRequest.find({
      doctor: req.user.userId,
      status: 'accepted'
    }).select('patient');

    const patientIds = acceptedRequests.map(req => req.patient);

    // Get medical records for these patients
    const medicalRecords = await MedicalRecord.find({
      patient: { $in: patientIds }
    });

    // Calculate statistics
    let totalAppointments = 0;
    let totalPrescriptions = 0;
    let totalDiseases = 0;
    let totalDiagnostics = 0;
    let totalComments = 0;
    let recentAppointments = [];
    let appointmentsByMonth = {};

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    medicalRecords.forEach(record => {
      // Count entries by this doctor
      const doctorAppointments = record.appointments.filter(a => a.doctor.toString() === req.user.userId);
      const doctorPrescriptions = record.prescriptions.filter(p => p.doctor.toString() === req.user.userId);
      const doctorDiseases = record.diseases.filter(d => d.doctor.toString() === req.user.userId);
      const doctorDiagnostics = record.diagnostics.filter(d => d.doctor.toString() === req.user.userId);
      const doctorComments = record.comments.filter(c => c.doctor.toString() === req.user.userId);

      totalAppointments += doctorAppointments.length;
      totalPrescriptions += doctorPrescriptions.length;
      totalDiseases += doctorDiseases.length;
      totalDiagnostics += doctorDiagnostics.length;
      totalComments += doctorComments.length;

      // Recent appointments (last 5)
      doctorAppointments.forEach(appointment => {
        recentAppointments.push({
          date: appointment.date,
          reason: appointment.reason,
          patientId: record.patient,
          createdAt: appointment.createdAt
        });
      });

      // Appointments by month (last 6 months)
      doctorAppointments.forEach(appointment => {
        const date = new Date(appointment.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        appointmentsByMonth[monthKey] = (appointmentsByMonth[monthKey] || 0) + 1;
      });
    });

    // Sort and limit recent appointments
    recentAppointments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    recentAppointments = recentAppointments.slice(0, 5);

    // Populate patient info for recent appointments
    for (let appointment of recentAppointments) {
      const patient = await User.findById(appointment.patientId).select('name familyName');
      appointment.patientName = patient ? `${patient.name} ${patient.familyName}` : 'Unknown';
    }

    // Generate last 6 months data
    const monthlyData = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthName = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      monthlyData.push({
        month: monthName,
        count: appointmentsByMonth[monthKey] || 0
      });
    }

    res.json({
      totalPatients,
      pendingRequests,
      totalAppointments,
      totalPrescriptions,
      totalDiseases,
      totalDiagnostics,
      totalComments,
      recentAppointments,
      monthlyData
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all patients (for doctors to send requests)
router.get('/patients/all', authMiddleware, doctorMiddleware, async (req, res) => {
  try {
    const patients = await User.find({ role: 'Patient' })
      .select('name familyName email')
      .sort({ name: 1 });
    
    // Get existing requests from this doctor
    const existingRequests = await DoctorRequest.find({ 
      doctor: req.user.userId 
    }).select('patient status');
    
    const requestMap = {};
    existingRequests.forEach(request => {
      requestMap[request.patient.toString()] = request.status;
    });
    
    const patientsWithStatus = patients.map(patient => ({
      _id: patient._id,
      name: patient.name,
      familyName: patient.familyName,
      email: patient.email,
      requestStatus: requestMap[patient._id.toString()] || 'none'
    }));
    
    res.json(patientsWithStatus);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Send doctor request to patient
router.post('/request/send', authMiddleware, doctorMiddleware, async (req, res) => {
  try {
    const { patientId } = req.body;
    
    if (!patientId) {
      return res.status(400).json({ message: 'Patient ID is required' });
    }
    
    // Check if patient exists
    const patient = await User.findOne({ _id: patientId, role: 'Patient' });
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }
    
    // Check if request already exists
    const existingRequest = await DoctorRequest.findOne({
      doctor: req.user.userId,
      patient: patientId
    });
    
    if (existingRequest) {
      // Allow resending if rejected
      if (existingRequest.status === 'rejected') {
        existingRequest.status = 'pending';
        await existingRequest.save();
        
        // Send notification
        const doctor = await User.findById(req.user.userId).select('name familyName');
        await notifyDoctorRequest(req.user.userId, patientId, `${doctor.name} ${doctor.familyName}`);
        
        return res.status(200).json({ 
          message: 'Request resent successfully',
          request: existingRequest
        });
      }
      
      return res.status(400).json({ 
        message: `Request already ${existingRequest.status}` 
      });
    }
    
    // Create new request
    const doctorRequest = new DoctorRequest({
      doctor: req.user.userId,
      patient: patientId
    });
    
    await doctorRequest.save();
    
    // Get doctor info and send notification
    const doctor = await User.findById(req.user.userId).select('name familyName');
    await notifyDoctorRequest(req.user.userId, patientId, `${doctor.name} ${doctor.familyName}`);
    
    res.status(201).json({ 
      message: 'Request sent successfully',
      request: doctorRequest
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get doctor's patients (accepted requests)
router.get('/patients/my-patients', authMiddleware, doctorMiddleware, async (req, res) => {
  try {
    const acceptedRequests = await DoctorRequest.find({
      doctor: req.user.userId,
      status: 'accepted'
    }).populate('patient', 'name familyName email');
    
    const patients = acceptedRequests.map(request => request.patient);
    
    res.json(patients);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get pending doctor requests (for patients)
router.get('/requests/pending', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'Patient') {
      return res.status(403).json({ message: 'Only patients can view requests' });
    }
    
    const pendingRequests = await DoctorRequest.find({
      patient: req.user.userId,
      status: 'pending'
    }).populate('doctor', 'name familyName email speciality');
    
    res.json(pendingRequests);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all doctor requests with status (for patients)
router.get('/requests/all', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'Patient') {
      return res.status(403).json({ message: 'Only patients can view requests' });
    }
    
    const requests = await DoctorRequest.find({
      patient: req.user.userId
    })
    .populate('doctor', 'name familyName email speciality')
    .sort({ createdAt: -1 });
    
    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Accept/reject doctor request
router.put('/request/:requestId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'Patient') {
      return res.status(403).json({ message: 'Only patients can respond to requests' });
    }
    
    const { requestId } = req.params;
    const { status } = req.body;
    
    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    
    const doctorRequest = await DoctorRequest.findOne({
      _id: requestId,
      patient: req.user.userId,
      status: 'pending'
    });
    
    if (!doctorRequest) {
      return res.status(404).json({ message: 'Request not found or already processed' });
    }
    
    doctorRequest.status = status;
    await doctorRequest.save();
    
    // Get patient info and send notification to doctor
    const patient = await User.findById(req.user.userId).select('name familyName');
    const patientName = `${patient.name} ${patient.familyName}`;
    
    if (status === 'accepted') {
      await notifyRequestAccepted(req.user.userId, doctorRequest.doctor, patientName);
      
      // Ensure medical record exists
      let medicalRecord = await MedicalRecord.findOne({ patient: req.user.userId });
      if (!medicalRecord) {
        medicalRecord = new MedicalRecord({
          patient: req.user.userId,
          appointments: [],
          prescriptions: [],
          diseases: [],
          comments: [],
          diagnostics: []
        });
        await medicalRecord.save();
      }
    } else if (status === 'rejected') {
      await notifyRequestRejected(req.user.userId, doctorRequest.doctor, patientName);
    }
    
    res.json({ 
      message: `Request ${status} successfully`,
      request: doctorRequest
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
