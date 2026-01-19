const express = require('express');
const router = express.Router();
const MedicalRecord = require('../models/MedicalRecord');
const DoctorRequest = require('../models/DoctorRequest');
const DoctorReceptionAgent = require('../models/DoctorReceptionAgent');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');
const { notifyMedicalRecordUpdate } = require('../services/notificationService');

// Get patient's medical record
router.get('/:patientId', authMiddleware, async (req, res) => {
  try {
    const { patientId } = req.params;
    
    // Check access permissions
    if (req.user.role === 'Patient') {
      // Patients can only view their own records
      if (patientId !== req.user.userId) {
        return res.status(403).json({ message: 'Access denied' });
      }
    } else if (req.user.role === 'Doctor') {
      // Doctors can only view records of patients who accepted their request
      const acceptedRequest = await DoctorRequest.findOne({
        doctor: req.user.userId,
        patient: patientId,
        status: 'accepted'
      });
      
      if (!acceptedRequest) {
        return res.status(403).json({ message: 'Access denied. Patient has not accepted your request.' });
      }
    } else if (req.user.role === 'Reception Agent') {
      // Reception agents can view records of patients belonging to their doctors
      const acceptedInvitations = await DoctorReceptionAgent.find({
        receptionAgent: req.user.userId,
        status: 'accepted'
      }).select('doctor');
      
      const doctorIds = acceptedInvitations.map(inv => inv.doctor);
      
      // Check if any of these doctors have access to this patient
      const patientDoctorAccess = await DoctorRequest.findOne({
        doctor: { $in: doctorIds },
        patient: patientId,
        status: 'accepted'
      });
      
      if (!patientDoctorAccess) {
        return res.status(403).json({ message: 'Access denied. This patient is not under any of your doctors.' });
      }
    } else {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    let medicalRecord = await MedicalRecord.findOne({ patient: patientId })
      .populate('appointments.doctor', 'name familyName')
      .populate('prescriptions.doctor', 'name familyName')
      .populate('diseases.doctor', 'name familyName')
      .populate('comments.doctor', 'name familyName')
      .populate('diagnostics.doctor', 'name familyName');
    
    if (!medicalRecord) {
      // Create empty record if it doesn't exist
      medicalRecord = new MedicalRecord({
        patient: patientId,
        appointments: [],
        prescriptions: [],
        diseases: [],
        comments: [],
        diagnostics: []
      });
      await medicalRecord.save();
    }
    
    res.json(medicalRecord);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Add appointment
router.post('/:patientId/appointment', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'Doctor' && req.user.role !== 'Reception Agent') {
      return res.status(403).json({ message: 'Only doctors and reception agents can add appointments' });
    }
    
    const { patientId } = req.params;
    const { date, reason, notes, doctorId } = req.body;
    
    let assignedDoctorId = req.user.userId;
    
    // If reception agent, they must specify which doctor this appointment is for
    if (req.user.role === 'Reception Agent') {
      if (!doctorId) {
        return res.status(400).json({ message: 'Doctor ID is required for reception agents' });
      }
      
      // Verify reception agent has access through this doctor
      const acceptedInvitation = await DoctorReceptionAgent.findOne({
        receptionAgent: req.user.userId,
        doctor: doctorId,
        status: 'accepted'
      });
      
      if (!acceptedInvitation) {
        return res.status(403).json({ message: 'You do not have access through this doctor' });
      }
      
      // Verify doctor has access to patient
      const doctorAccess = await DoctorRequest.findOne({
        doctor: doctorId,
        patient: patientId,
        status: 'accepted'
      });
      
      if (!doctorAccess) {
        return res.status(403).json({ message: 'This doctor does not have access to this patient' });
      }
      
      assignedDoctorId = doctorId;
    } else {
      // Verify doctor has access
      const acceptedRequest = await DoctorRequest.findOne({
        doctor: req.user.userId,
        patient: patientId,
        status: 'accepted'
      });
      
      if (!acceptedRequest) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }
    
    let medicalRecord = await MedicalRecord.findOne({ patient: patientId });
    if (!medicalRecord) {
      medicalRecord = new MedicalRecord({ patient: patientId });
    }
    
    medicalRecord.appointments.push({
      doctor: assignedDoctorId,
      date,
      reason,
      notes
    });
    
    await medicalRecord.save();
    await medicalRecord.populate('appointments.doctor', 'name familyName');
    
    // Send notification to patient
    const doctor = await User.findById(assignedDoctorId).select('name familyName');
    await notifyMedicalRecordUpdate(
      assignedDoctorId,
      patientId,
      'appointment',
      `${doctor.name} ${doctor.familyName}`
    );
    
    res.status(201).json({ 
      message: 'Appointment added successfully',
      appointment: medicalRecord.appointments[medicalRecord.appointments.length - 1]
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update appointment
router.put('/:patientId/appointment/:appointmentId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'Doctor' && req.user.role !== 'Reception Agent') {
      return res.status(403).json({ message: 'Only doctors and reception agents can update appointments' });
    }
    
    const { patientId, appointmentId } = req.params;
    const { date, reason, notes } = req.body;
    
    const medicalRecord = await MedicalRecord.findOne({ patient: patientId });
    if (!medicalRecord) {
      return res.status(404).json({ message: 'Medical record not found' });
    }
    
    const appointment = medicalRecord.appointments.id(appointmentId);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }
    
    // Check permissions
    if (req.user.role === 'Doctor') {
      // Doctors can only modify their own appointments
      if (appointment.doctor.toString() !== req.user.userId) {
        return res.status(403).json({ message: 'You can only modify your own appointments' });
      }
    } else if (req.user.role === 'Reception Agent') {
      // Reception agents can modify appointments for their doctors' patients
      const acceptedInvitation = await DoctorReceptionAgent.findOne({
        receptionAgent: req.user.userId,
        doctor: appointment.doctor,
        status: 'accepted'
      });
      
      if (!acceptedInvitation) {
        return res.status(403).json({ message: 'You can only modify appointments for your assigned doctors' });
      }
    }
    
    if (date) appointment.date = date;
    if (reason) appointment.reason = reason;
    if (notes !== undefined) appointment.notes = notes;
    
    await medicalRecord.save();
    await medicalRecord.populate('appointments.doctor', 'name familyName');
    
    // Send notification to patient
    const doctor = await User.findById(appointment.doctor).select('name familyName');
    await notifyMedicalRecordUpdate(
      appointment.doctor,
      patientId,
      'appointment',
      `${doctor.name} ${doctor.familyName}`
    );
    
    res.json({ 
      message: 'Appointment updated successfully',
      appointment
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete appointment
router.delete('/:patientId/appointment/:appointmentId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'Doctor' && req.user.role !== 'Reception Agent') {
      return res.status(403).json({ message: 'Only doctors and reception agents can delete appointments' });
    }
    
    const { patientId, appointmentId } = req.params;
    
    const medicalRecord = await MedicalRecord.findOne({ patient: patientId });
    if (!medicalRecord) {
      return res.status(404).json({ message: 'Medical record not found' });
    }
    
    const appointment = medicalRecord.appointments.id(appointmentId);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }
    
    // Check permissions
    if (req.user.role === 'Doctor') {
      // Doctors can only delete their own appointments
      if (appointment.doctor.toString() !== req.user.userId) {
        return res.status(403).json({ message: 'You can only delete your own appointments' });
      }
    } else if (req.user.role === 'Reception Agent') {
      // Reception agents can delete appointments for their doctors' patients
      const acceptedInvitation = await DoctorReceptionAgent.findOne({
        receptionAgent: req.user.userId,
        doctor: appointment.doctor,
        status: 'accepted'
      });
      
      if (!acceptedInvitation) {
        return res.status(403).json({ message: 'You can only delete appointments for your assigned doctors' });
      }
    }
    
    const doctorId = appointment.doctor;
    appointment.deleteOne();
    await medicalRecord.save();
    
    // Send notification to patient
    const doctor = await User.findById(doctorId).select('name familyName');
    await notifyMedicalRecordUpdate(
      doctorId,
      patientId,
      'appointment',
      `${doctor.name} ${doctor.familyName}`
    );
    
    res.json({ message: 'Appointment deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Add prescription
router.post('/:patientId/prescription', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'Doctor') {
      return res.status(403).json({ message: 'Only doctors can add prescriptions' });
    }
    
    const { patientId } = req.params;
    const { medication, dosage, duration, instructions } = req.body;
    
    const acceptedRequest = await DoctorRequest.findOne({
      doctor: req.user.userId,
      patient: patientId,
      status: 'accepted'
    });
    
    if (!acceptedRequest) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    let medicalRecord = await MedicalRecord.findOne({ patient: patientId });
    if (!medicalRecord) {
      medicalRecord = new MedicalRecord({ patient: patientId });
    }
    
    medicalRecord.prescriptions.push({
      doctor: req.user.userId,
      medication,
      dosage,
      duration,
      instructions
    });
    
    await medicalRecord.save();
    await medicalRecord.populate('prescriptions.doctor', 'name familyName');
    
    // Send notification to patient
    const doctor = await User.findById(req.user.userId).select('name familyName');
    await notifyMedicalRecordUpdate(
      req.user.userId,
      patientId,
      'prescription',
      `${doctor.name} ${doctor.familyName}`
    );
    
    res.status(201).json({ 
      message: 'Prescription added successfully',
      prescription: medicalRecord.prescriptions[medicalRecord.prescriptions.length - 1]
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update prescription
router.put('/:patientId/prescription/:prescriptionId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'Doctor') {
      return res.status(403).json({ message: 'Only doctors can update prescriptions' });
    }
    
    const { patientId, prescriptionId } = req.params;
    const { medication, dosage, duration, instructions } = req.body;
    
    const medicalRecord = await MedicalRecord.findOne({ patient: patientId });
    if (!medicalRecord) {
      return res.status(404).json({ message: 'Medical record not found' });
    }
    
    const prescription = medicalRecord.prescriptions.id(prescriptionId);
    if (!prescription) {
      return res.status(404).json({ message: 'Prescription not found' });
    }
    
    if (prescription.doctor.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'You can only modify your own prescriptions' });
    }
    
    if (medication) prescription.medication = medication;
    if (dosage) prescription.dosage = dosage;
    if (duration !== undefined) prescription.duration = duration;
    if (instructions !== undefined) prescription.instructions = instructions;
    
    await medicalRecord.save();
    await medicalRecord.populate('prescriptions.doctor', 'name familyName');
    
    // Send notification to patient
    const doctor = await User.findById(req.user.userId).select('name familyName');
    await notifyMedicalRecordUpdate(
      req.user.userId,
      patientId,
      'prescription',
      `${doctor.name} ${doctor.familyName}`
    );
    
    res.json({ 
      message: 'Prescription updated successfully',
      prescription
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete prescription
router.delete('/:patientId/prescription/:prescriptionId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'Doctor') {
      return res.status(403).json({ message: 'Only doctors can delete prescriptions' });
    }
    
    const { patientId, prescriptionId } = req.params;
    
    const medicalRecord = await MedicalRecord.findOne({ patient: patientId });
    if (!medicalRecord) {
      return res.status(404).json({ message: 'Medical record not found' });
    }
    
    const prescription = medicalRecord.prescriptions.id(prescriptionId);
    if (!prescription) {
      return res.status(404).json({ message: 'Prescription not found' });
    }
    
    if (prescription.doctor.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'You can only delete your own prescriptions' });
    }
    
    prescription.deleteOne();
    await medicalRecord.save();
    
    // Send notification to patient
    const doctor = await User.findById(req.user.userId).select('name familyName');
    await notifyMedicalRecordUpdate(
      req.user.userId,
      patientId,
      'prescription',
      `${doctor.name} ${doctor.familyName}`
    );
    
    res.json({ message: 'Prescription deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Add disease
router.post('/:patientId/disease', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'Doctor') {
      return res.status(403).json({ message: 'Only doctors can add diseases' });
    }
    
    const { patientId } = req.params;
    const { name, diagnosedDate, status, notes } = req.body;
    
    const acceptedRequest = await DoctorRequest.findOne({
      doctor: req.user.userId,
      patient: patientId,
      status: 'accepted'
    });
    
    if (!acceptedRequest) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    let medicalRecord = await MedicalRecord.findOne({ patient: patientId });
    if (!medicalRecord) {
      medicalRecord = new MedicalRecord({ patient: patientId });
    }
    
    medicalRecord.diseases.push({
      doctor: req.user.userId,
      name,
      diagnosedDate,
      status,
      notes
    });
    
    await medicalRecord.save();
    await medicalRecord.populate('diseases.doctor', 'name familyName');
    
    // Send notification to patient
    const doctor = await User.findById(req.user.userId).select('name familyName');
    await notifyMedicalRecordUpdate(
      req.user.userId,
      patientId,
      'disease',
      `${doctor.name} ${doctor.familyName}`
    );
    
    res.status(201).json({ 
      message: 'Disease added successfully',
      disease: medicalRecord.diseases[medicalRecord.diseases.length - 1]
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update disease
router.put('/:patientId/disease/:diseaseId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'Doctor') {
      return res.status(403).json({ message: 'Only doctors can update diseases' });
    }
    
    const { patientId, diseaseId } = req.params;
    const { name, diagnosedDate, status, notes } = req.body;
    
    const medicalRecord = await MedicalRecord.findOne({ patient: patientId });
    if (!medicalRecord) {
      return res.status(404).json({ message: 'Medical record not found' });
    }
    
    const disease = medicalRecord.diseases.id(diseaseId);
    if (!disease) {
      return res.status(404).json({ message: 'Disease not found' });
    }
    
    if (disease.doctor.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'You can only modify your own disease entries' });
    }
    
    if (name) disease.name = name;
    if (diagnosedDate) disease.diagnosedDate = diagnosedDate;
    if (status) disease.status = status;
    if (notes !== undefined) disease.notes = notes;
    
    await medicalRecord.save();
    await medicalRecord.populate('diseases.doctor', 'name familyName');
    
    // Send notification to patient
    const doctor = await User.findById(req.user.userId).select('name familyName');
    await notifyMedicalRecordUpdate(
      req.user.userId,
      patientId,
      'disease',
      `${doctor.name} ${doctor.familyName}`
    );
    
    res.json({ 
      message: 'Disease updated successfully',
      disease
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete disease
router.delete('/:patientId/disease/:diseaseId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'Doctor') {
      return res.status(403).json({ message: 'Only doctors can delete diseases' });
    }
    
    const { patientId, diseaseId } = req.params;
    
    const medicalRecord = await MedicalRecord.findOne({ patient: patientId });
    if (!medicalRecord) {
      return res.status(404).json({ message: 'Medical record not found' });
    }
    
    const disease = medicalRecord.diseases.id(diseaseId);
    if (!disease) {
      return res.status(404).json({ message: 'Disease not found' });
    }
    
    if (disease.doctor.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'You can only delete your own disease entries' });
    }
    
    disease.deleteOne();
    await medicalRecord.save();
    
    // Send notification to patient
    const doctor = await User.findById(req.user.userId).select('name familyName');
    await notifyMedicalRecordUpdate(
      req.user.userId,
      patientId,
      'disease',
      `${doctor.name} ${doctor.familyName}`
    );
    
    res.json({ message: 'Disease deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Add comment
router.post('/:patientId/comment', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'Doctor') {
      return res.status(403).json({ message: 'Only doctors can add comments' });
    }
    
    const { patientId } = req.params;
    const { text } = req.body;
    
    const acceptedRequest = await DoctorRequest.findOne({
      doctor: req.user.userId,
      patient: patientId,
      status: 'accepted'
    });
    
    if (!acceptedRequest) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    let medicalRecord = await MedicalRecord.findOne({ patient: patientId });
    if (!medicalRecord) {
      medicalRecord = new MedicalRecord({ patient: patientId });
    }
    
    medicalRecord.comments.push({
      doctor: req.user.userId,
      text
    });
    
    await medicalRecord.save();
    await medicalRecord.populate('comments.doctor', 'name familyName');
    
    // Send notification to patient
    const doctor = await User.findById(req.user.userId).select('name familyName');
    await notifyMedicalRecordUpdate(
      req.user.userId,
      patientId,
      'comment',
      `${doctor.name} ${doctor.familyName}`
    );
    
    res.status(201).json({ 
      message: 'Comment added successfully',
      comment: medicalRecord.comments[medicalRecord.comments.length - 1]
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update comment
router.put('/:patientId/comment/:commentId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'Doctor') {
      return res.status(403).json({ message: 'Only doctors can update comments' });
    }
    
    const { patientId, commentId } = req.params;
    const { text } = req.body;
    
    const medicalRecord = await MedicalRecord.findOne({ patient: patientId });
    if (!medicalRecord) {
      return res.status(404).json({ message: 'Medical record not found' });
    }
    
    const comment = medicalRecord.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    
    if (comment.doctor.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'You can only modify your own comments' });
    }
    
    if (text) comment.text = text;
    
    await medicalRecord.save();
    await medicalRecord.populate('comments.doctor', 'name familyName');
    
    // Send notification to patient
    const doctor = await User.findById(req.user.userId).select('name familyName');
    await notifyMedicalRecordUpdate(
      req.user.userId,
      patientId,
      'comment',
      `${doctor.name} ${doctor.familyName}`
    );
    
    res.json({ 
      message: 'Comment updated successfully',
      comment
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete comment
router.delete('/:patientId/comment/:commentId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'Doctor') {
      return res.status(403).json({ message: 'Only doctors can delete comments' });
    }
    
    const { patientId, commentId } = req.params;
    
    const medicalRecord = await MedicalRecord.findOne({ patient: patientId });
    if (!medicalRecord) {
      return res.status(404).json({ message: 'Medical record not found' });
    }
    
    const comment = medicalRecord.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    
    if (comment.doctor.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'You can only delete your own comments' });
    }
    
    comment.deleteOne();
    await medicalRecord.save();
    
    // Send notification to patient
    const doctor = await User.findById(req.user.userId).select('name familyName');
    await notifyMedicalRecordUpdate(
      req.user.userId,
      patientId,
      'comment',
      `${doctor.name} ${doctor.familyName}`
    );
    
    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Add diagnostic
router.post('/:patientId/diagnostic', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'Doctor') {
      return res.status(403).json({ message: 'Only doctors can add diagnostics' });
    }
    
    const { patientId } = req.params;
    const { testName, testDate, results, notes } = req.body;
    
    const acceptedRequest = await DoctorRequest.findOne({
      doctor: req.user.userId,
      patient: patientId,
      status: 'accepted'
    });
    
    if (!acceptedRequest) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    let medicalRecord = await MedicalRecord.findOne({ patient: patientId });
    if (!medicalRecord) {
      medicalRecord = new MedicalRecord({ patient: patientId });
    }
    
    medicalRecord.diagnostics.push({
      doctor: req.user.userId,
      testName,
      testDate,
      results,
      notes
    });
    
    await medicalRecord.save();
    await medicalRecord.populate('diagnostics.doctor', 'name familyName');
    
    // Send notification to patient
    const doctor = await User.findById(req.user.userId).select('name familyName');
    await notifyMedicalRecordUpdate(
      req.user.userId,
      patientId,
      'diagnostic',
      `${doctor.name} ${doctor.familyName}`
    );
    
    res.status(201).json({ 
      message: 'Diagnostic added successfully',
      diagnostic: medicalRecord.diagnostics[medicalRecord.diagnostics.length - 1]
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update diagnostic
router.put('/:patientId/diagnostic/:diagnosticId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'Doctor') {
      return res.status(403).json({ message: 'Only doctors can update diagnostics' });
    }
    
    const { patientId, diagnosticId } = req.params;
    const { testName, testDate, results, notes } = req.body;
    
    const medicalRecord = await MedicalRecord.findOne({ patient: patientId });
    if (!medicalRecord) {
      return res.status(404).json({ message: 'Medical record not found' });
    }
    
    const diagnostic = medicalRecord.diagnostics.id(diagnosticId);
    if (!diagnostic) {
      return res.status(404).json({ message: 'Diagnostic not found' });
    }
    
    if (diagnostic.doctor.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'You can only modify your own diagnostic entries' });
    }
    
    if (testName) diagnostic.testName = testName;
    if (testDate) diagnostic.testDate = testDate;
    if (results) diagnostic.results = results;
    if (notes !== undefined) diagnostic.notes = notes;
    
    await medicalRecord.save();
    await medicalRecord.populate('diagnostics.doctor', 'name familyName');
    
    // Send notification to patient
    const doctor = await User.findById(req.user.userId).select('name familyName');
    await notifyMedicalRecordUpdate(
      req.user.userId,
      patientId,
      'diagnostic',
      `${doctor.name} ${doctor.familyName}`
    );
    
    res.json({ 
      message: 'Diagnostic updated successfully',
      diagnostic
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete diagnostic
router.delete('/:patientId/diagnostic/:diagnosticId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'Doctor') {
      return res.status(403).json({ message: 'Only doctors can delete diagnostics' });
    }
    
    const { patientId, diagnosticId } = req.params;
    
    const medicalRecord = await MedicalRecord.findOne({ patient: patientId });
    if (!medicalRecord) {
      return res.status(404).json({ message: 'Medical record not found' });
    }
    
    const diagnostic = medicalRecord.diagnostics.id(diagnosticId);
    if (!diagnostic) {
      return res.status(404).json({ message: 'Diagnostic not found' });
    }
    
    if (diagnostic.doctor.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'You can only delete your own diagnostic entries' });
    }
    
    diagnostic.deleteOne();
    await medicalRecord.save();
    
    // Send notification to patient
    const doctor = await User.findById(req.user.userId).select('name familyName');
    await notifyMedicalRecordUpdate(
      req.user.userId,
      patientId,
      'diagnostic',
      `${doctor.name} ${doctor.familyName}`
    );
    
    res.json({ message: 'Diagnostic deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
