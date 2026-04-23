// src/models/plan.model.js
export default (sequelize, DataTypes) => {
    const Plan = sequelize.define(
        "Plan",
        {
            id: {
                type: DataTypes.BIGINT.UNSIGNED,
                primaryKey: true,
                autoIncrement: true,
            },
            code: {
                type: DataTypes.STRING(50),
                allowNull: false,
                unique: true,
            },
            name: {
                type: DataTypes.STRING(120),
                allowNull: false,
            },
            price_cents: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            currency: {
                type: DataTypes.STRING(3),
                allowNull: false,
                defaultValue: "VND",
            },
            duration_days: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            is_active: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            features: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: [],
            },
        },
        {
            tableName: "plans",
            timestamps: true,
        }
    );

    return Plan;
};
