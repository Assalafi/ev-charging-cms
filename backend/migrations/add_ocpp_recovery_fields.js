const { DataTypes, Op } = require('sequelize');

/**
 * Durable OCPP recovery fields. All additions are nullable/defaulted so this
 * migration preserves existing transaction and protocol history.
 */
module.exports = {
  async up(queryInterface) {
    const transactionColumns = await queryInterface.describeTable('transactions');
    const messageColumns = await queryInterface.describeTable('ocpp_messages');

    const transactionFields = {
      billingAttempts: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of billing attempts made for this transaction'
      },
      billingLastError: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Last billing failure; retained for retry diagnostics'
      },
      billingNextAttemptAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Earliest time at which a failed billing attempt may be retried'
      },
      offlineSince: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'When the station connection was lost while this transaction was active'
      }
    };

    for (const [name, definition] of Object.entries(transactionFields)) {
      if (!transactionColumns[name]) {
        await queryInterface.addColumn('transactions', name, definition);
      }
    }

    const messageFields = {
      processedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'When an inbound request finished processing'
      },
      processingError: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Processing error retained for retry diagnostics'
      },
      responsePayload: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: 'Cached OCPP response for idempotent request replay'
      },
      dedupeKey: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Inbound request idempotency key; existing history remains nullable'
      }
    };

    for (const [name, definition] of Object.entries(messageFields)) {
      if (!messageColumns[name]) {
        await queryInterface.addColumn('ocpp_messages', name, definition);
      }
    }

    await queryInterface.addIndex('transactions', ['status', 'offlineSince'], {
      name: 'transactions_recovery_status_offline_since_idx'
    }).catch(error => {
      if (!/already exists/i.test(error.message)) throw error;
    });

    // Sequelize may have created this unnamed legacy index from an earlier
    // model sync. It is redundant once the explicit migration index exists.
    await queryInterface.removeIndex('ocpp_messages', 'ocpp_messages_dedupe_key').catch(() => {});

    // Do not rewrite or delete historical OCPP records. Only newly received
    // messages populate dedupeKey, so this unique partial index is safe even
    // when old duplicate protocol records already exist.
    await queryInterface.addIndex('ocpp_messages', ['dedupeKey'], {
      name: 'ocpp_messages_dedupe_key_unique',
      unique: true,
      where: {
        dedupeKey: { [Op.ne]: null }
      }
    }).catch(error => {
      if (!/already exists/i.test(error.message)) throw error;
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('ocpp_messages', 'ocpp_messages_dedupe_key_unique').catch(() => {});
    await queryInterface.removeIndex('transactions', 'transactions_recovery_status_offline_since_idx').catch(() => {});

    for (const column of ['dedupeKey', 'responsePayload', 'processingError', 'processedAt']) {
      const columns = await queryInterface.describeTable('ocpp_messages');
      if (columns[column]) await queryInterface.removeColumn('ocpp_messages', column);
    }
    for (const column of ['offlineSince', 'billingNextAttemptAt', 'billingLastError', 'billingAttempts']) {
      const columns = await queryInterface.describeTable('transactions');
      if (columns[column]) await queryInterface.removeColumn('transactions', column);
    }
  }
};
