// src/models/review.model.js
import { DataTypes } from "sequelize";

export default (sequelize) => {
    const Review = sequelize.define(
        "Review",
        {
            id: {
                type: DataTypes.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true,
            },

            user_id: {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: false,
            },

            title_id: {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: false,
            },

            episode_id: {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: true,
            },

            body: {
                type: DataTypes.TEXT,
                allowNull: false,
            },

            is_spoiler: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
        },
        {
            tableName: "reviews",
            timestamps: true,
            underscored: true, // created_at, updated_at
        }
    );

    return Review;
};
