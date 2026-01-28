// AI-based risk calculation algorithms
// Based on established medical risk scoring systems

function calculateBMI(weight, height) {
  // BMI = weight(kg) / (height(m))^2
  const heightInMeters = height / 100;
  return weight / (heightInMeters * heightInMeters);
}

function calculateStrokeRisk(assessment) {
  let score = 0;
  const factors = [];
  
  // Age factor (heavily weighted)
  if (assessment.age >= 75) {
    score += 30;
    factors.push('Age 75+ significantly increases stroke risk');
  } else if (assessment.age >= 65) {
    score += 20;
    factors.push('Age 65-74 increases stroke risk');
  } else if (assessment.age >= 55) {
    score += 10;
    factors.push('Age 55+ moderately increases stroke risk');
  }
  
  // Medical history
  if (assessment.hasHighBloodPressure) {
    score += 25;
    factors.push('High blood pressure is a major stroke risk factor');
  }
  
  if (assessment.hasDiabetes) {
    score += 15;
    factors.push('Diabetes increases stroke risk');
  }
  
  if (assessment.hadStroke) {
    score += 35;
    factors.push('Previous stroke significantly increases risk of recurrence');
  }
  
  if (assessment.hasHeartDisease) {
    score += 20;
    factors.push('Heart disease increases stroke risk');
  }
  
  if (assessment.hasHighCholesterol) {
    score += 10;
    factors.push('High cholesterol contributes to stroke risk');
  }
  
  // Lifestyle factors
  if (assessment.smokingStatus === 'Current') {
    score += 15;
    factors.push('Current smoking doubles stroke risk');
  } else if (assessment.smokingStatus === 'Former') {
    score += 5;
    factors.push('Former smoking slightly increases risk');
  }
  
  if (assessment.exerciseFrequency === 'Never' || assessment.exerciseFrequency === 'Rarely') {
    score += 8;
    factors.push('Lack of exercise increases stroke risk');
  }
  
  // BMI factor
  const bmi = calculateBMI(assessment.weight, assessment.height);
  if (bmi >= 30) {
    score += 12;
    factors.push('Obesity (BMI ≥30) increases stroke risk');
  } else if (bmi >= 25) {
    score += 6;
    factors.push('Overweight (BMI 25-30) moderately increases risk');
  }
  
  // Family history
  if (assessment.familyStroke) {
    score += 10;
    factors.push('Family history of stroke increases risk');
  }
  
  // Current symptoms (immediate concern)
  if (assessment.numbness || assessment.dizziness) {
    score += 15;
    factors.push('Current symptoms require immediate medical attention');
  }
  
  // Cap score at 100
  score = Math.min(score, 100);
  
  // Determine risk level
  let risk;
  if (score >= 70) risk = 'Very High';
  else if (score >= 50) risk = 'High';
  else if (score >= 30) risk = 'Moderate';
  else risk = 'Low';
  
  if (factors.length === 0) {
    factors.push('No major risk factors identified. Maintain healthy lifestyle.');
  }
  
  return { risk, score, factors };
}

function calculateHeartDiseaseRisk(assessment) {
  let score = 0;
  const factors = [];
  
  // Age factor
  if (assessment.age >= 65) {
    score += 25;
    factors.push('Age 65+ significantly increases heart disease risk');
  } else if (assessment.age >= 55) {
    score += 15;
    factors.push('Age 55+ increases heart disease risk');
  } else if (assessment.age >= 45) {
    score += 8;
    factors.push('Age 45+ moderately increases risk');
  }
  
  // Gender factor
  if (assessment.gender === 'Male' && assessment.age >= 45) {
    score += 10;
    factors.push('Men over 45 have higher heart disease risk');
  } else if (assessment.gender === 'Female' && assessment.age >= 55) {
    score += 10;
    factors.push('Women over 55 have increased heart disease risk');
  }
  
  // Medical history
  if (assessment.hasHeartDisease) {
    score += 40;
    factors.push('Existing heart disease requires ongoing management');
  }
  
  if (assessment.hasHighBloodPressure) {
    score += 20;
    factors.push('High blood pressure damages arteries over time');
  }
  
  if (assessment.hasHighCholesterol) {
    score += 18;
    factors.push('High cholesterol clogs arteries');
  }
  
  if (assessment.hasDiabetes) {
    score += 20;
    factors.push('Diabetes significantly increases heart disease risk');
  }
  
  // Lifestyle factors
  if (assessment.smokingStatus === 'Current') {
    score += 20;
    factors.push('Smoking is a leading cause of heart disease');
  } else if (assessment.smokingStatus === 'Former') {
    score += 8;
    factors.push('Former smoking still poses some risk');
  }
  
  if (assessment.exerciseFrequency === 'Never' || assessment.exerciseFrequency === 'Rarely') {
    score += 10;
    factors.push('Physical inactivity weakens the heart');
  }
  
  if (assessment.alcoholConsumption === 'Heavily') {
    score += 12;
    factors.push('Heavy alcohol use damages the heart');
  }
  
  // BMI factor
  const bmi = calculateBMI(assessment.weight, assessment.height);
  if (bmi >= 30) {
    score += 15;
    factors.push('Obesity strains the cardiovascular system');
  } else if (bmi >= 25) {
    score += 8;
    factors.push('Being overweight increases heart disease risk');
  }
  
  // Family history
  if (assessment.familyHeartDisease) {
    score += 12;
    factors.push('Family history of heart disease increases risk');
  }
  
  // Current symptoms
  if (assessment.chestPain) {
    score += 20;
    factors.push('Chest pain requires immediate medical evaluation');
  }
  
  if (assessment.shortnessOfBreath) {
    score += 12;
    factors.push('Shortness of breath may indicate heart problems');
  }
  
  // Cap score at 100
  score = Math.min(score, 100);
  
  // Determine risk level
  let risk;
  if (score >= 70) risk = 'Very High';
  else if (score >= 50) risk = 'High';
  else if (score >= 30) risk = 'Moderate';
  else risk = 'Low';
  
  if (factors.length === 0) {
    factors.push('No major risk factors identified. Keep up healthy habits.');
  }
  
  return { risk, score, factors };
}

function calculateDiabetesRisk(assessment) {
  let score = 0;
  const factors = [];
  
  // Existing diabetes
  if (assessment.hasDiabetes) {
    return {
      risk: 'Very High',
      score: 100,
      factors: ['Already diagnosed with diabetes. Continue treatment and monitoring.']
    };
  }
  
  // Age factor
  if (assessment.age >= 45) {
    score += 15;
    factors.push('Age 45+ increases diabetes risk');
  }
  
  // BMI is the strongest predictor
  const bmi = calculateBMI(assessment.weight, assessment.height);
  if (bmi >= 35) {
    score += 30;
    factors.push('Severe obesity (BMI ≥35) greatly increases diabetes risk');
  } else if (bmi >= 30) {
    score += 25;
    factors.push('Obesity (BMI 30-35) significantly increases diabetes risk');
  } else if (bmi >= 25) {
    score += 15;
    factors.push('Being overweight (BMI 25-30) increases diabetes risk');
  }
  
  // Family history (strong genetic component)
  if (assessment.familyDiabetes) {
    score += 20;
    factors.push('Family history of diabetes increases risk significantly');
  }
  
  // Lifestyle factors
  if (assessment.exerciseFrequency === 'Never' || assessment.exerciseFrequency === 'Rarely') {
    score += 12;
    factors.push('Physical inactivity increases diabetes risk');
  }
  
  // High blood pressure (often co-occurs)
  if (assessment.hasHighBloodPressure) {
    score += 10;
    factors.push('High blood pressure often accompanies diabetes');
  }
  
  // High cholesterol
  if (assessment.hasHighCholesterol) {
    score += 8;
    factors.push('High cholesterol increases diabetes risk');
  }
  
  // Symptoms
  if (assessment.fatigue) {
    score += 10;
    factors.push('Chronic fatigue may indicate blood sugar issues');
  }
  
  // Cap score at 100
  score = Math.min(score, 100);
  
  // Determine risk level
  let risk;
  if (score >= 70) risk = 'Very High';
  else if (score >= 50) risk = 'High';
  else if (score >= 30) risk = 'Moderate';
  else risk = 'Low';
  
  if (factors.length === 0) {
    factors.push('Low risk. Maintain healthy weight and active lifestyle.');
  }
  
  return { risk, score, factors };
}

function calculateAllRisks(assessment) {
  return {
    stroke: calculateStrokeRisk(assessment),
    heartDisease: calculateHeartDiseaseRisk(assessment),
    diabetes: calculateDiabetesRisk(assessment)
  };
}

module.exports = {
  calculateBMI,
  calculateStrokeRisk,
  calculateHeartDiseaseRisk,
  calculateDiabetesRisk,
  calculateAllRisks
};
