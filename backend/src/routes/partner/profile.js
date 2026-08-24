const express = require('express');
const { Op } = require('sequelize');
const { User, PartnerCompany } = require('../../models');
const { authenticate } = require('../../middleware/auth');
const { partnerOnly } = require('../../middleware/partnerScope');
const logger = require('../../utils/logger');

const router = express.Router();
router.use(authenticate, partnerOnly);

const userAttributes = ['id', 'username', 'email', 'role', 'partnerId', 'lastLogin', 'createdAt'];
const partnerAttributes = [
  'id', 'name', 'businessName', 'registrationNumber', 'contactPersonName',
  'contactEmail', 'contactPhone', 'address', 'country', 'state', 'city',
  'logoUrl', 'status', 'settlementFrequency', 'bankName', 'bankAccountName',
  'bankAccountNumber'
];

router.get('/', async (req, res) => {
  try {
    const [user, partner] = await Promise.all([
      User.findByPk(req.user.id, { attributes: userAttributes }),
      PartnerCompany.findByPk(req.partnerId, { attributes: partnerAttributes })
    ]);
    res.json({ success: true, user, partner });
  } catch (error) {
    logger.error('Error fetching partner profile:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch profile' });
  }
});

router.put('/', async (req, res) => {
  try {
    const { username, email, currentPassword, newPassword } = req.body;
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (!username || !email) {
      return res.status(400).json({ success: false, message: 'Username and email are required' });
    }

    const duplicate = await User.findOne({
      where: {
        id: { [Op.ne]: user.id },
        [Op.or]: [{ username }, { email }]
      }
    });
    if (duplicate) {
      return res.status(409).json({ success: false, message: 'Username or email is already in use' });
    }

    const update = { username, email };
    if (newPassword) {
      if (!currentPassword || !(await user.comparePassword(currentPassword))) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect' });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ success: false, message: 'New password must be at least 8 characters' });
      }
      update.password = newPassword;
    }

    await user.update(update);
    const safeUser = await User.findByPk(user.id, { attributes: userAttributes });
    res.json({ success: true, message: 'Profile updated successfully', user: safeUser });
  } catch (error) {
    logger.error('Error updating partner profile:', error);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
});

module.exports = router;
