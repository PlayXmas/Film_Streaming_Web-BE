// src/models/user.model.js
export default (sequelize, DataTypes) => {
    const User = sequelize.define(
        "User",
        {
            id: {
                type: DataTypes.BIGINT.UNSIGNED,
                primaryKey: true,
                autoIncrement: true,
            },
            email: { type: DataTypes.STRING(190), allowNull: false, unique: true },
            password_hash: { type: DataTypes.STRING(255) },
            google_id: { type: DataTypes.STRING(64), unique: true },
            display_name: { type: DataTypes.STRING(120), allowNull: false },
            avatar_url: { type: DataTypes.STRING(255) },
            gender: {
                type: DataTypes.ENUM("male", "female", "unspecified"),
            },
            role: {
                type: DataTypes.ENUM("admin", "vip", "free"),
                allowNull: false,
                defaultValue: "free",
            },
            is_active: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
        },
        {
            tableName: "users",
            timestamps: true,
        }
    );

    return User;
};
