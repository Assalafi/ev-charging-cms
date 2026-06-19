const bcrypt = require('bcrypt');

async function createAdminUser() {
  const password = 'admin123';
  const hashedPassword = await bcrypt.hash(password, 10);
  
  console.log('Hashed password:', hashedPassword);
  console.log('SQL to insert admin user:');
  console.log(`INSERT INTO users (username, email, password, role, active, created_at, updated_at) VALUES`);
  console.log(`('admin', 'admin@localhost', '${hashedPassword}', 'admin', true, NOW(), NOW());`);
}

createAdminUser().catch(console.error);
