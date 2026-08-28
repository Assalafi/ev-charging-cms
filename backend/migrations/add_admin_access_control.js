module.exports = {
  async up(queryInterface, Sequelize) {
    // Keep the database enum aligned with every administrative role exposed by
    // accessControl.js. PostgreSQL rejects an entire IN query when even one
    // supplied enum value is missing, which makes the admin-users list fail.
    const [roleRows] = await queryInterface.sequelize.query(`
      SELECT enum_value.enumlabel
      FROM pg_type enum_type
      JOIN pg_enum enum_value ON enum_type.oid = enum_value.enumtypid
      WHERE enum_type.typname = 'enum_users_role'
    `);
    const existingRoles = new Set(roleRows.map(row => row.enumlabel));
    for (const role of ['super_admin', 'manager', 'finance', 'operations', 'support']) {
      if (existingRoles.has(role)) continue;
      await queryInterface.sequelize.query(
        `ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS '${role}'`
      );
    }

    const table = await queryInterface.describeTable('users');
    if (!table.fullName) await queryInterface.addColumn('users', 'fullName', { type: Sequelize.STRING, allowNull: true });
    if (!table.permissions) await queryInterface.addColumn('users', 'permissions', { type: Sequelize.JSONB, allowNull: true, defaultValue: null });
    if (!table.scopeType) await queryInterface.addColumn('users', 'scopeType', { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'all' });
    if (!table.managedStates) await queryInterface.addColumn('users', 'managedStates', { type: Sequelize.JSONB, allowNull: false, defaultValue: [] });
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('users');
    if (table.managedStates) await queryInterface.removeColumn('users', 'managedStates');
    if (table.scopeType) await queryInterface.removeColumn('users', 'scopeType');
    if (table.permissions) await queryInterface.removeColumn('users', 'permissions');
    if (table.fullName) await queryInterface.removeColumn('users', 'fullName');
    // PostgreSQL enum values are intentionally retained to keep rollback non-destructive.
  }
};
