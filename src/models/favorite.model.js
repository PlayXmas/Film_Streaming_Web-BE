// src/models/favorite.model.js
export default (sequelize, DataTypes) => {
    const Favorite = sequelize.define(
        "Favorite",
        {
            user_id: {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: false,
                primaryKey: true,
            },
            title_id: {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: false,
                primaryKey: true,
            },
            created_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW,
                field: "created_at",
            },

        },
        {
            tableName: "favorites",
            timestamps: false,
        }
    );

    return Favorite;
};
