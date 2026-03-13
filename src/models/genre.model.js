// src/models/genre.model.js
export default (sequelize, DataTypes) => {
    const Genre = sequelize.define(
        "Genre",
        {
            id: {
                type: DataTypes.BIGINT.UNSIGNED,
                primaryKey: true,
                autoIncrement: true,
            },
            slug: { type: DataTypes.STRING(100), allowNull: false, unique: true },
            name: { type: DataTypes.STRING(100), allowNull: false },
        },
        {
            tableName: "genres",
            timestamps: true,
        }
    );

    return Genre;
};
