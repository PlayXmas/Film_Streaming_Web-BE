// src/models/userRecommendation.model.js
export default (sequelize, DataTypes) => {
    const UserRecommendation = sequelize.define(
        "UserRecommendation",
        {
            user_id: {
                type: DataTypes.BIGINT.UNSIGNED,
                primaryKey: true,
                allowNull: false,
            },
            title_id: {
                type: DataTypes.BIGINT.UNSIGNED,
                primaryKey: true,
                allowNull: false,
            },
            score: {
                type: DataTypes.DOUBLE,
                allowNull: false,
            },
            generated_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
        },
        {
            tableName: "user_recommendations",
            timestamps: false,
        }
    );

    return UserRecommendation;
};
