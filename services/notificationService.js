const Notification = require('../models/Notification');

// Helper function to create notifications
async function createNotification({ recipient, sender, type, title, message, link }) {
  try {
    const notification = new Notification({
      recipient,
      sender,
      type,
      title,
      message,
      link
    });
    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
}

// Notification for doctor request sent
async function notifyDoctorRequest(doctorId, patientId, doctorName) {
  return await createNotification({
    recipient: patientId,
    sender: doctorId,
    type: 'doctor_request',
    title: 'New Doctor Access Request',
    message: `Dr. ${doctorName} has requested access to your medical records`,
    link: '/dashboard/doctor-requests'
  });
}

// Notification for request accepted
async function notifyRequestAccepted(patientId, doctorId, patientName) {
  return await createNotification({
    recipient: doctorId,
    sender: patientId,
    type: 'request_accepted',
    title: 'Access Request Accepted',
    message: `${patientName} has accepted your access request`,
    link: '/dashboard/doctor-patients'
  });
}

// Notification for request rejected
async function notifyRequestRejected(patientId, doctorId, patientName) {
  return await createNotification({
    recipient: doctorId,
    sender: patientId,
    type: 'request_rejected',
    title: 'Access Request Rejected',
    message: `${patientName} has rejected your access request`,
    link: '/dashboard/doctor-patients'
  });
}

// Notification for new medical record entry
async function notifyMedicalRecordUpdate(doctorId, patientId, type, doctorName) {
  const typeLabels = {
    appointment: 'appointment',
    prescription: 'prescription',
    disease: 'diagnosis',
    diagnostic: 'diagnostic test',
    comment: 'comment'
  };
  
  return await createNotification({
    recipient: patientId,
    sender: doctorId,
    type: `${type}_added`,
    title: 'Medical Record Updated',
    message: `Dr. ${doctorName} added a new ${typeLabels[type]} to your medical record`,
    link: `/dashboard/medical-record/${patientId}`
  });
}

module.exports = {
  createNotification,
  notifyDoctorRequest,
  notifyRequestAccepted,
  notifyRequestRejected,
  notifyMedicalRecordUpdate
};
