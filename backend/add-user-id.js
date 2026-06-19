const { sequelize } = require('./src/models');

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('Database connected');

    // Add userId column
    await sequelize.query(`
      ALTER TABLE transactions 
      ADD COLUMN IF NOT EXISTS user_id INTEGER 
      REFERENCES mobile_users(id)
    `);
    console.log('Added user_id column to transactions');

    // Add index
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_user_id 
      ON transactions(user_id)
    `);
    console.log('Added index on user_id');

    // Backfill userId for existing transactions
    const result = await sequelize.query(`
      UPDATE transactions t
      SET user_id = mu.id
      FROM mobile_users mu
      WHERE t.idTag = mu.tagId
      AND t.user_id IS NULL
    `);
    console.log('Backfilled userId for existing transactions');

    console.log('Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
