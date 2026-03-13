// src/models/titleGenre.model.js
export default (sequelize, DataTypes) => {
    const TitleGenre = sequelize.define(
        "TitleGenre",
        {
            title_id: {
                type: DataTypes.BIGINT.UNSIGNED,
                primaryKey: true,
            },
            genre_id: {
                type: DataTypes.BIGINT.UNSIGNED,
                primaryKey: true,
            },
        },
        {
            tableName: "title_genres",
            timestamps: false,
        }
    );

    return TitleGenre;
};
