const express = require('express');
const router = express.Router();
const HealthAssessment = require('../models/HealthAssessment');
const { authMiddleware } = require('../middleware/auth');
const { calculateAllRisks } = require('../services/riskCalculationService');

// Check if patient has completed assessment
router.get('/check', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'Patient') {
      return res.json({ completed: true }); // Only patients need assessment
    }
    
    const assessment = await HealthAssessment.findOne({ patient: req.user.userId });
    res.json({ completed: !!assessment });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get patient's health assessment
router.get('/my-assessment', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'Patient') {
      return res.status(403).json({ message: 'Only patients can view assessments' });
    }
    
    const assessment = await HealthAssessment.findOne({ patient: req.user.userId });
    
    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found' });
    }
    
    res.json(assessment);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get patient's assessment (for doctors)
router.get('/patient/:patientId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'Doctor' && req.user.role !== 'Reception Agent') {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const { patientId } = req.params;
    
    // Verify doctor has access to this patient
    if (req.user.role === 'Doctor') {
      const DoctorRequest = require('../models/DoctorRequest');
      const access = await DoctorRequest.findOne({
        doctor: req.user.userId,
        patient: patientId,
        status: 'accepted'
      });
      
      if (!access) {
        return res.status(403).json({ message: 'No access to this patient' });
      }
    }
    
    const assessment = await HealthAssessment.findOne({ patient: patientId });
    
    if (!assessment) {
      return res.status(404).json({ message: 'Patient has not completed health assessment' });
    }
    
    res.json(assessment);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Submit health assessment
router.post('/submit', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'Patient') {
      return res.status(403).json({ message: 'Only patients can submit assessments' });
    }
    
    const {
      age, gender, height, weight,
      hasDiabetes, hasHighBloodPressure, hasHeartDisease, hadStroke, hasHighCholesterol,
      smokingStatus, exerciseFrequency, alcoholConsumption,
      familyHeartDisease, familyStroke, familyDiabetes,
      chestPain, shortnessOfBreath, dizziness, fatigue, numbness
    } = req.body;
    
    // Validate required fields
    if (!age || !gender || !height || !weight || !smokingStatus || !exerciseFrequency || !alcoholConsumption) {
      return res.status(400).json({ message: 'All required fields must be filled' });
    }
    
    // Check if assessment already exists
    let assessment = await HealthAssessment.findOne({ patient: req.user.userId });
    
    const assessmentData = {
      patient: req.user.userId,
      age, gender, height, weight,
      hasDiabetes: hasDiabetes || false,
      hasHighBloodPressure: hasHighBloodPressure || false,
      hasHeartDisease: hasHeartDisease || false,
      hadStroke: hadStroke || false,
      hasHighCholesterol: hasHighCholesterol || false,
      smokingStatus,
      exerciseFrequency,
      alcoholConsumption,
      familyHeartDisease: familyHeartDisease || false,
      familyStroke: familyStroke || false,
      familyDiabetes: familyDiabetes || false,
      chestPain: chestPain || false,
      shortnessOfBreath: shortnessOfBreath || false,
      dizziness: dizziness || false,
      fatigue: fatigue || false,
      numbness: numbness || false,
      updatedAt: new Date()
    };
    
    // Calculate risk predictions using AI algorithms
    const predictions = calculateAllRisks(assessmentData);
    assessmentData.predictions = predictions;
    
    if (assessment) {
      // Update existing assessment
      Object.assign(assessment, assessmentData);
      await assessment.save();
    } else {
      // Create new assessment
      assessment = new HealthAssessment(assessmentData);
      await assessment.save();
    }
    
    res.status(201).json({
      message: 'Health assessment completed successfully',
      assessment,
      predictions
    });
  } catch (error) {
    console.error('Assessment error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
