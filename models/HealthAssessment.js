const mongoose = require('mongoose');

const healthAssessmentSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  // Basic Information
  age: {
    type: Number,
    required: true,
    min: 0,
    max: 150
  },
  gender: {
    type: String,
    required: true,
    enum: ['Male', 'Female', 'Other']
  },
  height: {
    type: Number, // in cm
    required: true,
    min: 50,
    max: 300
  },
  weight: {
    type: Number, // in kg
    required: true,
    min: 20,
    max: 500
  },
  
  // Medical History
  hasDiabetes: {
    type: Boolean,
    required: true,
    default: false
  },
  hasHighBloodPressure: {
    type: Boolean,
    required: true,
    default: false
  },
  hasHeartDisease: {
    type: Boolean,
    required: true,
    default: false
  },
  hadStroke: {
    type: Boolean,
    required: true,
    default: false
  },
  hasHighCholesterol: {
    type: Boolean,
    required: true,
    default: false
  },
  
  // Lifestyle Factors
  smokingStatus: {
    type: String,
    required: true,
    enum: ['Never', 'Former', 'Current']
  },
  exerciseFrequency: {
    type: String,
    required: true,
    enum: ['Never', 'Rarely', 'Sometimes', 'Regularly', 'Daily']
  },
  alcoholConsumption: {
    type: String,
    required: true,
    enum: ['Never', 'Occasionally', 'Moderately', 'Heavily']
  },
  
  // Family History
  familyHeartDisease: {
    type: Boolean,
    required: true,
    default: false
  },
  familyStroke: {
    type: Boolean,
    required: true,
    default: false
  },
  familyDiabetes: {
    type: Boolean,
    required: true,
    default: false
  },
  
  // Current Symptoms
  chestPain: {
    type: Boolean,
    default: false
  },
  shortnessOfBreath: {
    type: Boolean,
    default: false
  },
  dizziness: {
    type: Boolean,
    default: false
  },
  fatigue: {
    type: Boolean,
    default: false
  },
  numbness: {
    type: Boolean,
    default: false
  },
  
  // Risk Predictions (calculated by backend)
  predictions: {
    stroke: {
      risk: { type: String, enum: ['Low', 'Moderate', 'High', 'Very High'] },
      score: { type: Number, min: 0, max: 100 },
      factors: [String]
    },
    heartDisease: {
      risk: { type: String, enum: ['Low', 'Moderate', 'High', 'Very High'] },
      score: { type: Number, min: 0, max: 100 },
      factors: [String]
    },
    diabetes: {
      risk: { type: String, enum: ['Low', 'Moderate', 'High', 'Very High'] },
      score: { type: Number, min: 0, max: 100 },
      factors: [String]
    }
  },
  
  completedAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

healthAssessmentSchema.index({ patient: 1 });

const HealthAssessment = mongoose.model('HealthAssessment', healthAssessmentSchema);

module.exports = HealthAssessment;
