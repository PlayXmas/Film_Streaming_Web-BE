// src/models/season.model.js
export default (sequelize, DataTypes) => {
    const Season = sequelize.define(
        "Season",
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
            season_number: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            name: { type: DataTypes.STRING(255) },
            release_year: {
                type: DataTypes.INTEGER,
                allowNull: true
            },
            overview: { type: DataTypes.TEXT },
            poster_url: { type: DataTypes.STRING(255) },
            access_tier: {
                type: DataTypes.ENUM("free", "vip"),
                allowNull: false,
                defaultValue: "free",
            },
        },
        {
            tableName: "seasons",
            timestamps: true,
        }
    );

    return Season;
};
