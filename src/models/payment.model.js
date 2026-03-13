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
            subscription_id: {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: true,
            },
            provider: {
                type: DataTypes.ENUM("MOMO", "VNPAY", "STRIPE"),
                allowNull: false,
            },
            provider_txn_id: {
                type: DataTypes.STRING(190),
            },
            amount_cents: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            currency: {
                type: DataTypes.STRING(3),
                allowNull: false,
                defaultValue: "VND",
            },
            status: {
                type: DataTypes.ENUM("pending", "succeeded", "failed", "refunded"),
                allowNull: false,
            },
            payload: {
                type: DataTypes.JSON,
            },
        },
        {
            tableName: "payments",
            timestamps: true,
        }
    );

    return Payment;
};
