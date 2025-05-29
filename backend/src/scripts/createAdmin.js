const { User } = require('../models');
const logger = require('../utils/logger');

async function createAdminUser() {
    try {
        // Check if admin user already exists
        const adminExists = await User.findOne({
            where: { username: 'admin' }
        });

        if (adminExists) {
            logger.info('Admin user already exists');
            return;
        }

        // Create admin user
        await User.create({
            username: 'admin',
            email: 'admin@example.com',
            password: 'admin123',
            role: 'admin',
            active: true
        });

        logger.info('Admin user created successfully');
    } catch (error) {
        logger.error('Error creating admin user:', error);
    }
}

// Run if this script is executed directly
if (require.main === module) {
    createAdminUser()
        .then(() => process.exit(0))
        .catch((error) => {
            logger.error('Script error:', error);
            process.exit(1);
        });
}
