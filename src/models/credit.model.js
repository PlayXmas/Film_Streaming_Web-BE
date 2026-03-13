// src/models/credit.model.js
export default (sequelize, DataTypes) => {
    const Credit = sequelize.define(
        "Credit",
        {
            id: {
                type: DataTypes.BIGINT.UNSIGNED,
                primaryKey: true,
                autoIncrement: true,
            },
            title_id: {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: false,
            },
            person_id: {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: false,
            },
            credit_type: {
                type: DataTypes.ENUM("cast", "crew"),
                allowNull: false,
            },
            role_name: { type: DataTypes.STRING(120) },
            order_no: { type: DataTypes.INTEGER },
        },
        {
            tableName: "credits",
            timestamps: true,
        }
    );

    return Credit;
};
