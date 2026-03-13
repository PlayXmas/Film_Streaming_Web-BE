// src/models/title.model.js
export default (sequelize, DataTypes) => {
    const Title = sequelize.define(
        "Title",
        {
            id: {
                type: DataTypes.BIGINT.UNSIGNED,
                primaryKey: true,
                autoIncrement: true,
            },
            type: {
                type: DataTypes.ENUM("movie", "series"),
                allowNull: false,
            },
            slug: { type: DataTypes.STRING(190), allowNull: false, unique: true },
            name: { type: DataTypes.STRING(255), allowNull: false },
            original_name: { type: DataTypes.STRING(255) },
            overview: { type: DataTypes.TEXT },
            release_year: { type: DataTypes.SMALLINT },
            age_rating: { type: DataTypes.STRING(10) },
            imdb_id: { type: DataTypes.STRING(20) },
            imdb_score: { type: DataTypes.DECIMAL(3, 1) },
            country_code: { type: DataTypes.STRING(2) },
            original_lang: { type: DataTypes.STRING(10) },
            poster_url: { type: DataTypes.STRING(255) },
            backdrop_url: { type: DataTypes.STRING(255) },
            runtime_min: { type: DataTypes.INTEGER },
            is_public: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            access_tier: {
                type: DataTypes.ENUM("free", "vip"),
                allowNull: false,
                defaultValue: "free",
            },
            popularity: {
                type: DataTypes.DECIMAL(10, 3),
                allowNull: false,
                defaultValue: 0,
            },
        },
        {
            tableName: "titles",
            timestamps: true,
        }
    );

    return Title;
};
