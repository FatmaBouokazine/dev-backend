const express = require('express');
const router = express.Router();
const User = require('../models/User');
const DoctorReceptionAgent = require('../models/DoctorReceptionAgent');
const { authMiddleware } = require('../middleware/auth');

// Middleware to check if user is a doctor
const doctorMiddleware = (req, res, next) => {
  if (req.user.role !== 'Doctor') {
    return res.status(403).json({ message: 'Access denied. Doctor role required.' });
  }
  next();
};

// Middleware to check if user is a reception agent
const receptionAgentMiddleware = (req, res, next) => {
  if (req.user.role !== 'Reception Agent') {
    return res.status(403).json({ message: 'Access denied. Reception Agent role required.' });
  }
  next();
};

// Get all reception agents (for doctors to send invitations)
router.get('/all', authMiddleware, doctorMiddleware, async (req, res) => {
  try {
    const receptionAgents = await User.find({ role: 'Reception Agent' })
      .select('name familyName email')
      .sort({ name: 1 });
    
    // Get existing invitations from this doctor
    const existingInvitations = await DoctorReceptionAgent.find({ 
      doctor: req.user.userId 
    }).select('receptionAgent status');
    
    const invitationMap = {};
    existingInvitations.forEach(invitation => {
      invitationMap[invitation.receptionAgent.toString()] = invitation.status;
    });
    
    const receptionAgentsWithStatus = receptionAgents.map(agent => ({
      _id: agent._id,
      name: agent.name,
      familyName: agent.familyName,
      email: agent.email,
      invitationStatus: invitationMap[agent._id.toString()] || 'none'
    }));
    
    res.json(receptionAgentsWithStatus);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Send invitation to reception agent (doctor)
router.post('/invite', authMiddleware, doctorMiddleware, async (req, res) => {
  try {
    const { receptionAgentId } = req.body;
    
    if (!receptionAgentId) {
      return res.status(400).json({ message: 'Reception Agent ID is required' });
    }
    
    // Check if reception agent exists
    const receptionAgent = await User.findOne({ _id: receptionAgentId, role: 'Reception Agent' });
    if (!receptionAgent) {
      return res.status(404).json({ message: 'Reception Agent not found' });
    }
    
    // Check if invitation already exists
    const existingInvitation = await DoctorReceptionAgent.findOne({
      doctor: req.user.userId,
      receptionAgent: receptionAgentId
    });
    
    if (existingInvitation) {
      // Allow resending if rejected
      if (existingInvitation.status === 'rejected') {
        existingInvitation.status = 'pending';
        await existingInvitation.save();
        
        // Send notification
        const doctor = await User.findById(req.user.userId).select('name familyName');
        const { createNotification } = require('../services/notificationService');
        await createNotification({
          recipient: receptionAgentId,
          sender: req.user.userId,
          type: 'doctor_request',
          title: 'New Doctor Invitation',
          message: `Dr. ${doctor.name} ${doctor.familyName} has invited you to manage their patients' appointments`,
          link: '/dashboard/doctor-invitations'
        });
        
        return res.status(200).json({ 
          message: 'Invitation resent successfully',
          invitation: existingInvitation
        });
      }
      
      return res.status(400).json({ 
        message: `Invitation already ${existingInvitation.status}` 
      });
    }
    
    // Create new invitation
    const invitation = new DoctorReceptionAgent({
      doctor: req.user.userId,
      receptionAgent: receptionAgentId
    });
    
    await invitation.save();
    
    // Send notification
    const doctor = await User.findById(req.user.userId).select('name familyName');
    const { createNotification } = require('../services/notificationService');
    await createNotification({
      recipient: receptionAgentId,
      sender: req.user.userId,
      type: 'doctor_request',
      title: 'New Doctor Invitation',
      message: `Dr. ${doctor.name} ${doctor.familyName} has invited you to manage their patients' appointments`,
      link: '/dashboard/doctor-invitations'
    });
    
    res.status(201).json({ 
      message: 'Invitation sent successfully',
      invitation
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get my accepted doctors (reception agent)
router.get('/my-doctors', authMiddleware, receptionAgentMiddleware, async (req, res) => {
  try {
    const acceptedInvitations = await DoctorReceptionAgent.find({
      receptionAgent: req.user.userId,
      status: 'accepted'
    }).populate('doctor', 'name familyName email speciality');
    
    const doctors = acceptedInvitations.map(invitation => invitation.doctor);
    
    res.json(doctors);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all patients from my accepted doctors (reception agent)
router.get('/patients', authMiddleware, receptionAgentMiddleware, async (req, res) => {
  try {
    const acceptedInvitations = await DoctorReceptionAgent.find({
      receptionAgent: req.user.userId,
      status: 'accepted'
    }).select('doctor');
    
    const doctorIds = acceptedInvitations.map(inv => inv.doctor);
    
    // Get all patients that these doctors have access to
    const DoctorRequest = require('../models/DoctorRequest');
    const doctorPatients = await DoctorRequest.find({
      doctor: { $in: doctorIds },
      status: 'accepted'
    })
    .populate('patient', 'name familyName email')
    .populate('doctor', 'name familyName speciality');
    
    res.json(doctorPatients.map(dp => ({
      ...dp.patient._doc,
      doctorName: `${dp.doctor.name} ${dp.doctor.familyName}`
    })));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get pending invitations (reception agent)
router.get('/invitations/pending', authMiddleware, receptionAgentMiddleware, async (req, res) => {
  try {
    const pendingInvitations = await DoctorReceptionAgent.find({
      receptionAgent: req.user.userId,
      status: 'pending'
    }).populate('doctor', 'name familyName email speciality');
    
    res.json(pendingInvitations);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all invitations with status (reception agent)
router.get('/invitations/all', authMiddleware, receptionAgentMiddleware, async (req, res) => {
  try {
    const invitations = await DoctorReceptionAgent.find({
      receptionAgent: req.user.userId
    })
    .populate('doctor', 'name familyName email speciality')
    .sort({ createdAt: -1 });
    
    res.json(invitations);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Accept/reject doctor invitation (reception agent)
router.put('/invitation/:invitationId', authMiddleware, receptionAgentMiddleware, async (req, res) => {
  try {
    const { invitationId } = req.params;
    const { status } = req.body;
    
    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    
    const invitation = await DoctorReceptionAgent.findOne({
      _id: invitationId,
      receptionAgent: req.user.userId,
      status: 'pending'
    });
    
    if (!invitation) {
      return res.status(404).json({ message: 'Invitation not found or already processed' });
    }
    
    invitation.status = status;
    await invitation.save();
    
    // Send notification to doctor
    const receptionAgent = await User.findById(req.user.userId).select('name familyName');
    const receptionAgentName = `${receptionAgent.name} ${receptionAgent.familyName}`;
    
    const { createNotification } = require('../services/notificationService');
    
    if (status === 'accepted') {
      await createNotification({
        recipient: invitation.doctor,
        sender: req.user.userId,
        type: 'request_accepted',
        title: 'Invitation Accepted',
        message: `${receptionAgentName} has accepted your invitation`,
        link: '/dashboard/reception-agents'
      });
    } else if (status === 'rejected') {
      await createNotification({
        recipient: invitation.doctor,
        sender: req.user.userId,
        type: 'request_rejected',
        title: 'Invitation Rejected',
        message: `${receptionAgentName} has rejected your invitation`,
        link: '/dashboard/reception-agents'
      });
    }
    
    res.json({ 
      message: `Invitation ${status} successfully`,
      invitation
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Remove reception agent (doctor)
router.delete('/:receptionAgentId', authMiddleware, doctorMiddleware, async (req, res) => {
  try {
    const { receptionAgentId } = req.params;
    
    const invitation = await DoctorReceptionAgent.findOneAndDelete({
      doctor: req.user.userId,
      receptionAgent: receptionAgentId
    });
    
    if (!invitation) {
      return res.status(404).json({ message: 'Reception agent relationship not found' });
    }
    
    res.json({ message: 'Reception agent removed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
