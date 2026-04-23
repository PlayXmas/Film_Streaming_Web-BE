// src/models/passwordResetToken.model.js
export default (sequelize, DataTypes) => {
    const PasswordResetToken = sequelize.define(
        "PasswordResetToken",
        {
            id: {
                type: DataTypes.BIGINT.UNSIGNED,
                primaryKey: true,
                autoIncrement: true,
            },
            user_id: {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: false,
            },
            email: {
                type: DataTypes.STRING(190),
                allowNull: false,
            },
            code_hash: {
                type: DataTypes.STRING(255),
                allowNull: false,
            },
            reset_token_hash: {
                type: DataTypes.STRING(255),
                allowNull: true,
            },
            expires_at: {
                type: DataTypes.DATE,
                allowNull: false,
            },
            verified_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            used_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            revoked_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            attempts: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                defaultValue: 0,
            },
        },
        {
            tableName: "password_reset_tokens",
            timestamps: true,
        }
    );

    return PasswordResetToken;
};
