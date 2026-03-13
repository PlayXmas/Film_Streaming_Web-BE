// src/models/vTitlePublic.model.js
export default (sequelize, DataTypes) => {
    const VTitlePublic = sequelize.define(
        "VTitlePublic",
        {
            id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true },
            type: DataTypes.ENUM("movie", "series"),
            slug: DataTypes.STRING(190),
            name: DataTypes.STRING(255),
            release_year: DataTypes.SMALLINT,
            country_code: DataTypes.STRING(2),
            poster_url: DataTypes.STRING(255),
            backdrop_url: DataTypes.STRING(255),
            access_tier: DataTypes.ENUM("free", "vip"),
            popularity: DataTypes.DECIMAL(10, 3),
        },
        {
            tableName: "v_titles_public",
            timestamps: false,
        }
    );

    return VTitlePublic;
};
