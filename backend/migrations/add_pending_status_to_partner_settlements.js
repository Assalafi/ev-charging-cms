module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'enum_partner_settlements_status'
        ) THEN
          ALTER TYPE "enum_partner_settlements_status" ADD VALUE IF NOT EXISTS 'pending';
        END IF;
      END
      $$;
    `);
  },

  async down() {
    // PostgreSQL does not safely remove an enum value in place. The value is
    // additive and keeping it is safer than rewriting existing settlement data.
  }
};
