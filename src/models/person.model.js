// src/models/person.model.js
export default (sequelize, DataTypes) => {
    const Person = sequelize.define(
        "Person",
        {
            id: {
                type: DataTypes.BIGINT.UNSIGNED,
                primaryKey: true,
                autoIncrement: true,
            },
            name: { type: DataTypes.STRING(190), allowNull: false },

            description: { type: DataTypes.TEXT, allowNull: true },

            also_known_as: { type: DataTypes.STRING(255), allowNull: true },
            avatar_url: { type: DataTypes.STRING(255), allowNull: true },
        },
        {
            tableName: "people",
            timestamps: true,
        }
    );

    return Person;
};
