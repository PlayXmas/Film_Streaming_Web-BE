export default (sequelize, DataTypes) => {
    const PaymentEvent = sequelize.define(
        "PaymentEvent",
        {
            id: {
                type: DataTypes.BIGINT.UNSIGNED,
                primaryKey: true,
                autoIncrement: true,
            },
            payment_id: {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: false,
            },
            event_type: {
                type: DataTypes.ENUM(
                    "created",
                    "redirect_requested",
                    "return_received",
                    "ipn_received",
                    "ipn_processed",
                    "querydr_requested",
                    "querydr_completed",
                    "querydr_failed",
                    "marked_succeeded",
                    "marked_failed",
                    "marked_cancelled",
                    "marked_expired",
                    "refund_requested",
                    "refund_completed",
                    "manual_updated"
                ),
                allowNull: false,
            },
            event_source: {
                type: DataTypes.ENUM("system", "vnpay_return", "vnpay_ipn", "admin", "cron"),
                allowNull: false,
                defaultValue: "system",
            },
            is_success: {
                type: DataTypes.BOOLEAN,
                allowNull: true,
            },
            signature_valid: {
                type: DataTypes.BOOLEAN,
                allowNull: true,
            },
            response_code: {
                type: DataTypes.STRING(8),
                allowNull: true,
            },
            transaction_status: {
                type: DataTypes.STRING(8),
                allowNull: true,
            },
            message: {
                type: DataTypes.STRING(255),
                allowNull: true,
            },
            raw_payload: {
                type: DataTypes.JSON,
                allowNull: true,
            },
            normalized_payload: {
                type: DataTypes.JSON,
                allowNull: true,
            },
            processed_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
        },
        {
            tableName: "payment_events",
            createdAt: "created_at",
            updatedAt: false,
        }
    );

    return PaymentEvent;
};
