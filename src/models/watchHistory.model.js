// src/models/watchHistory.model.js
export default (sequelize, DataTypes) => {
    const WatchHistory = sequelize.define(
        "WatchHistory",
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
            title_id: {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: false,
            },
            episode_id: {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: true,
            },
            current_time_sec: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            duration_sec: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            progress_percent: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            is_finished: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            last_watched_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW,
            },
        },
        {
            tableName: "watch_history",
            timestamps: false,
        }
    );

    return WatchHistory;
};
