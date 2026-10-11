const express = require('express');
const jwt = require('jsonwebtoken');
const { CompanyUser, SubscriptionCompany } = require('../../models');
const { companyAuthenticate } = require('../../middleware/companyAuth');
const config = require('../../../../config/backend').backend;

const router = express.Router();

function safeUser(user) {
  const data = user.toJSON ? user.toJSON() : user;
  const { password, ...safe } = data;
  return safe;
}

router.post('/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password are required' });
    const user = await CompanyUser.findOne({
      where: { email },
      include: [{ model: SubscriptionCompany, as: 'company', attributes: ['id', 'name', 'email', 'phone', 'address', 'city', 'state', 'country', 'status'] }]
    });
    if (!user || !(await user.comparePassword(password))) return res.status(401).json({ success: false, message: 'Invalid company credentials' });
    if (user.status !== 'active') return res.status(401).json({ success: false, message: 'Company account is suspended' });
    if (!user.company || user.company.status !== 'active') return res.status(403).json({ success: false, message: 'Company access is currently suspended' });
    await user.update({ lastLogin: new Date() });
    const secret = process.env.JWT_SECRET || config.security.jwtSecret || 'ev-charging-secure-secret';
    const token = jwt.sign({ isCompany: true, companyUserId: user.id, companyId: user.companyId, role: user.role, email: user.email }, secret, { expiresIn: '24h' });
    res.json({ success: true, token, user: { ...safeUser(user), company: user.company } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to sign in to company portal' });
  }
});

router.get('/me', companyAuthenticate, async (req, res) => {
  res.json({ success: true, user: { ...req.companyUser, company: req.company } });
});

router.post('/change-password', companyAuthenticate, async (req, res) => {
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');
  if (newPassword.length < 8) return res.status(400).json({ success: false, message: 'New password must be at least 8 characters' });
  const user = await CompanyUser.findByPk(req.companyUser.id);
  if (!user || !(await user.comparePassword(currentPassword))) return res.status(400).json({ success: false, message: 'Current password is incorrect' });
  await user.update({ password: newPassword });
  res.json({ success: true, message: 'Password updated successfully' });
});

module.exports = router;

