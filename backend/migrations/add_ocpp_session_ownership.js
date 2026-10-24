const { DataTypes } = require('sequelize');

/**
 * Additive OCPP session-correlation schema. No transaction, billing, meter or
 * protocol history is rewritten or deleted.
 */
module.exports = {
  async up(queryInterface) {
    const columns = await queryInterface.describeTable('transactions');
    const fields = {
      ocppTransactionId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Transaction ID understood by the charge point'
      },
      ocppStartMessageId: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'StartTransaction request used as ownership evidence'
      },
      remoteStartMessageId: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Accepted RemoteStartTransaction used as ownership evidence'
      },
      ownershipSource: {
        type: DataTypes.STRING(50),
        allowNull: true
      },
      ownershipVerifiedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      lastMeterValueWh: {
        type: DataTypes.DOUBLE,
        allowNull: true
      },
      lastMeterTimestamp: {
        type: DataTypes.DATE,
        allowNull: true
      },
      lastMeterReceivedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      ocppStopMessageId: {
        type: DataTypes.STRING,
        allowNull: true
      },
      minimumChargeAmount: {
        type: DataTypes.DOUBLE,
        allowNull: true,
        comment: 'Snapshot of the minimum charge used for this session'
      }
    };

    for (const [name, definition] of Object.entries(fields)) {
      if (!columns[name]) await queryInterface.addColumn('transactions', name, definition);
    }

    const indexes = [
      {
        fields: ['chargePointId', 'connectorId', 'status'],
        name: 'transactions_station_connector_status_idx'
      },
      {
        fields: ['chargePointId', 'ocppTransactionId', 'status'],
        name: 'transactions_station_ocpp_tx_status_idx'
      },
      {
        fields: ['chargePointId', 'ocppStartMessageId'],
        name: 'transactions_station_start_message_idx'
      },
      {
        fields: ['lastMeterReceivedAt'],
        name: 'transactions_last_meter_received_idx'
      }
    ];
    for (const index of indexes) {
      await queryInterface.addIndex('transactions', index.fields, {
        name: index.name
      }).catch(error => {
        if (!/already exists/i.test(error.message)) throw error;
      });
    }

    // Enforce the physical invariant across restarts and multiple backend
    // processes. Existing rows are never rewritten: migration stops for
    // manual review if duplicate active connector sessions already exist.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS transactions_one_active_connector_idx
      ON transactions ("chargePointId", "connectorId")
      WHERE status = 'InProgress'
    `);

    const messageIndexes = [
      {
        fields: ['chargePointId', 'message_type', 'direction', 'createdAt'],
        name: 'ocpp_messages_station_type_direction_created_idx'
      },
      {
        fields: ['chargePointId', 'messageId', 'direction', 'message_type', 'createdAt'],
        name: 'ocpp_messages_station_message_correlation_idx'
      }
    ];
    for (const index of messageIndexes) {
      await queryInterface.addIndex('ocpp_messages', index.fields, {
        name: index.name,
        concurrently: true
      }).catch(error => {
        if (!/already exists/i.test(error.message)) throw error;
      });
    }
  },

  async down(queryInterface) {
    for (const index of [
      'ocpp_messages_station_message_correlation_idx',
      'ocpp_messages_station_type_direction_created_idx'
    ]) {
      await queryInterface.removeIndex('ocpp_messages', index).catch(() => {});
    }
    for (const index of [
      'transactions_last_meter_received_idx',
      'transactions_station_start_message_idx',
      'transactions_station_ocpp_tx_status_idx',
      'transactions_station_connector_status_idx',
      'transactions_one_active_connector_idx'
    ]) {
      await queryInterface.removeIndex('transactions', index).catch(() => {});
    }
    for (const column of [
      'ocppStopMessageId',
      'minimumChargeAmount',
      'lastMeterReceivedAt',
      'lastMeterTimestamp',
      'lastMeterValueWh',
      'ownershipVerifiedAt',
      'ownershipSource',
      'remoteStartMessageId',
      'ocppStartMessageId',
      'ocppTransactionId'
    ]) {
      const columns = await queryInterface.describeTable('transactions');
      if (columns[column]) await queryInterface.removeColumn('transactions', column);
    }
  }
};
