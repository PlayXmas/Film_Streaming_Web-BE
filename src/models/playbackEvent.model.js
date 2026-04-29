export default (sequelize, DataTypes) => {
    const PlaybackEvent = sequelize.define(
        "PlaybackEvent",
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
            origin_id: {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: true,
            },
            variant_id: {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: true,
            },
            session_id: {
                type: DataTypes.STRING(128),
                allowNull: true,
            },
            event_type: {
                type: DataTypes.ENUM(
                    "start",
                    "heartbeat",
                    "pause",
                    "seek",
                    "resume",
                    "ended",
                    "quality_change",
                    "error"
                ),
                allowNull: false,
                defaultValue: "heartbeat",
            },
            player_time_sec: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            duration_sec: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            progress_percent: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            playback_rate: {
                type: DataTypes.DECIMAL(4, 2),
                allowNull: true,
            },
            quality: {
                type: DataTypes.STRING(32),
                allowNull: true,
            },
            volume: {
                type: DataTypes.DECIMAL(5, 2),
                allowNull: true,
            },
            is_muted: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            event_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW,
            },
            meta: {
                type: DataTypes.JSON,
                allowNull: true,
            },
        },
        {
            tableName: "playback_events",
            timestamps: true,
        }
    );

    return PlaybackEvent;
};
