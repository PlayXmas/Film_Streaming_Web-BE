// src/models/image.model.js
export default (sequelize, DataTypes) => {
    const Image = sequelize.define(
        "Image",
        {
            id: {
                type: DataTypes.BIGINT.UNSIGNED,
                primaryKey: true,
                autoIncrement: true,
            },
            scope_type: {
                type: DataTypes.ENUM("title", "season", "episode", "person"),
                allowNull: false,
            },
            scope_id: {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: false,
            },
            kind: {
                type: DataTypes.ENUM("poster", "backdrop", "still", "profile"),
                allowNull: false,
            },
            url: {
                type: DataTypes.STRING(255),
                allowNull: false,
            },
            width: { type: DataTypes.INTEGER },
            height: { type: DataTypes.INTEGER },
            priority: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 100,
            },
        },
        {
            tableName: "images",
            timestamps: true,
        }
    );

    return Image;
};
