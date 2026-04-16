require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize } = require('./src/models');

async function resetAdminPassword() {
  try {
    await sequelize.authenticate();
    console.log('Connected to database');
    
    const newPassword = 'Admin@123';
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    
    const [results] = await sequelize.query(`
      UPDATE users 
      SET password = '${hashedPassword}', "updatedAt" = NOW() 
      WHERE username = 'admin'
      RETURNING id;
    `);
    
    if (results && results.length > 0) {
      console.log('Admin password reset successfully!');
      console.log('Username: admin');
      console.log(`Password: ${newPassword}`);
    } else {
      console.log('No admin user found to update.');
    }
    
    await sequelize.close();
  } catch (error) {
    console.error('Error resetting password:', error);
  }
}

resetAdminPassword();
