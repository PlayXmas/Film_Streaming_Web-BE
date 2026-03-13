// src/models/episode.model.js
export default (sequelize, DataTypes) => {
    const Episode = sequelize.define(
        "Episode",
        {
            id: {
                type: DataTypes.BIGINT.UNSIGNED,
                primaryKey: true,
                autoIncrement: true,
            },
            season_id: {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: false,
            },
            episode_number: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            name: { type: DataTypes.STRING(255) },
            overview: { type: DataTypes.TEXT },
            runtime_min: { type: DataTypes.INTEGER },
            view_count: {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: false,
                defaultValue: 0,
            },
            still_url: { type: DataTypes.STRING(255) },
            access_tier: {
                type: DataTypes.ENUM("free", "vip"),
                allowNull: false,
                defaultValue: "free",
            },
        },
        {
            tableName: "episodes",
            timestamps: true,
        }
    );

    return Episode;
};
