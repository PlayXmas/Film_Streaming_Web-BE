// src/models/report.model.js
export default (sequelize, DataTypes) => {
    const Report = sequelize.define(
        "Report",
        {
            id: {
                type: DataTypes.BIGINT.UNSIGNED,
                primaryKey: true,
                autoIncrement: true,
            },
            reporter_id: {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: false,
            },
            scope_type: {
                type: DataTypes.ENUM("review", "title", "episode"),
                allowNull: false,
            },
            scope_id: {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: false,
            },
            reason: {
                type: DataTypes.STRING(255),
                allowNull: false,
            },
            note: {
                type: DataTypes.TEXT,
            },
            status: {
                type: DataTypes.ENUM("open", "processing", "closed"),
                allowNull: false,
                defaultValue: "open",
            },
        },
        {
            tableName: "reports",
            timestamps: true,
        }
    );

    return Report;
};
