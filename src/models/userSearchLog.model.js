export default (sequelize, DataTypes) => {
    const UserSearchLog = sequelize.define(
        "UserSearchLog",
        {
            id: {
                type: DataTypes.BIGINT.UNSIGNED,
                primaryKey: true,
                autoIncrement: true,
            },
            user_id: {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: true,
            },
            session_id: {
                type: DataTypes.STRING(128),
                allowNull: true,
            },
            keyword: {
                type: DataTypes.STRING(255),
                allowNull: false,
            },
            normalized_keyword: {
                type: DataTypes.STRING(255),
                allowNull: true,
            },
            result_count: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: true,
            },
            filters: {
                type: DataTypes.JSON,
                allowNull: true,
            },
            source: {
                type: DataTypes.ENUM("submit", "click"),
                allowNull: false,
                defaultValue: "submit",
            },
            clicked_title_id: {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: true,
            },
            searched_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW,
            },
            clicked_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
        },
        {
            tableName: "user_search_logs",
            timestamps: true,
        }
    );

    return UserSearchLog;
};
