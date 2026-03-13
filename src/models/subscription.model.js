// src/models/subscription.model.js
export default (sequelize, DataTypes) => {
    const Subscription = sequelize.define(
        "Subscription",
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
                allowNull: false,
            },
            starts_at: {
                type: DataTypes.DATE,
                allowNull: false,
            },
            ends_at: {
                type: DataTypes.DATE,
                allowNull: false,
            },
            status: {
                type: DataTypes.ENUM("active", "expired", "cancelled"),
                allowNull: false,
                defaultValue: "active",
            },
        },
        {
            tableName: "subscriptions",
            timestamps: true,
        }
    );

    return Subscription;
};
