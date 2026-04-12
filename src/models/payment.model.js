// src/models/payment.model.js
export default (sequelize, DataTypes) => {
    const Payment = sequelize.define(
        "Payment",
        {
            id: {
                type: DataTypes.BIGINT.UNSIGNED,
                primaryKey: true,
                autoIncrement: true,
            },
            user_id: {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: false,
            },
            plan_id: {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: true,
            },
            subscription_id: {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: true,
            },
            provider: {
                type: DataTypes.ENUM("MOMO", "VNPAY", "STRIPE"),
                allowNull: false,
            },
            txn_ref: {
                type: DataTypes.STRING(64),
                allowNull: false,
                unique: true,
            },
            provider_txn_id: {
                type: DataTypes.STRING(190),
                allowNull: true,
                unique: true,
            },
            amount_cents: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            amount_expected: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            amount_paid: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            currency: {
                type: DataTypes.STRING(3),
                allowNull: false,
                defaultValue: "VND",
            },
            currency_snapshot: {
                type: DataTypes.STRING(3),
                allowNull: true,
            },
            plan_code_snapshot: {
                type: DataTypes.STRING(50),
                allowNull: true,
            },
            plan_name_snapshot: {
                type: DataTypes.STRING(120),
                allowNull: true,
            },
            duration_days_snapshot: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            status: {
                type: DataTypes.ENUM(
                    "pending",
                    "processing",
                    "succeeded",
                    "failed",
                    "cancelled",
                    "expired",
                    "refunded"
                ),
                allowNull: false,
            },
            payload: {
                type: DataTypes.JSON,
                allowNull: true,
            },
            initiated_at: {
                type: DataTypes.DATE,
                allowNull: false,
            },
            expires_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            paid_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            failed_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            cancelled_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            expired_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            refunded_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            ipn_received_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            bank_code: {
                type: DataTypes.STRING(32),
                allowNull: true,
            },
            bank_tran_no: {
                type: DataTypes.STRING(64),
                allowNull: true,
            },
            card_type: {
                type: DataTypes.STRING(32),
                allowNull: true,
            },
            failure_reason: {
                type: DataTypes.STRING(255),
                allowNull: true,
            },
            signature_valid: {
                type: DataTypes.BOOLEAN,
                allowNull: true,
            },
            last_response_code: {
                type: DataTypes.STRING(8),
                allowNull: true,
            },
            last_transaction_status: {
                type: DataTypes.STRING(8),
                allowNull: true,
            },
        },
        {
            tableName: "payments",
            timestamps: true,
        }
    );

    return Payment;
};
