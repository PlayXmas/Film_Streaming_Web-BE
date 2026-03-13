// src/models/rating.model.js
export default (sequelize, DataTypes) => {
    const Rating = sequelize.define(
        "Rating",
        {
            user_id: {
                type: DataTypes.BIGINT.UNSIGNED,
                primaryKey: true,
            },
            title_id: {
                type: DataTypes.BIGINT.UNSIGNED,
                primaryKey: true,
            },
            score: {
                type: DataTypes.TINYINT.UNSIGNED,
                allowNull: false,
                validate: { min: 1, max: 10 },
            },
            rated_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW,
            },
        },
        {
            tableName: "ratings",
            timestamps: false,
        }
    );

    return Rating;
};
