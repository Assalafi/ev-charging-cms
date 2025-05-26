require('dotenv').config();
const { Sequelize } = require('sequelize');
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: process.env.DB_DIALECT || 'postgres',
    logging: console.log
  }
);

async function setupDatabase() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established successfully.');

    // Create authorized_tags table if it doesn't exist
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS authorized_tags (
        id SERIAL PRIMARY KEY,
        tag_id VARCHAR(255) UNIQUE NOT NULL,
        status VARCHAR(20) DEFAULT 'Active',
        expiry_date TIMESTAMP,
        parent_tag_id VARCHAR(255),
        blocked BOOLEAN DEFAULT false,
        valid_from TIMESTAMP,
        valid_to TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('authorized_tags table created or already exists');

    // Insert sample authorized tags
    await sequelize.query(`
      INSERT INTO authorized_tags (tag_id, status) 
      VALUES 
        ('TAG001', 'Active'),
        ('TAG002', 'Active'),
        ('123456', 'Active'),
        ('TEST001', 'Active')
      ON CONFLICT (tag_id) DO NOTHING;
    `);
    console.log('Sample authorized tags inserted');

    console.log('Database setup completed successfully.');
  } catch (error) {
    console.error('Database setup error:', error);
  } finally {
    await sequelize.close();
  }
}

setupDatabase();
