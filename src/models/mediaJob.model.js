export default (sequelize, DataTypes) => {
    const MediaJob = sequelize.define(
        "MediaJob",
        {
            id: {
                type: DataTypes.BIGINT.UNSIGNED,
                primaryKey: true,
                autoIncrement: true,
            },
            origin_id: {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: false,
            },
            job_type: {
                type: DataTypes.ENUM("transcode_hls"),
                allowNull: false,
                defaultValue: "transcode_hls",
            },
            status: {
                type: DataTypes.ENUM("pending", "running", "completed", "failed"),
                allowNull: false,
                defaultValue: "pending",
            },
            attempts: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                defaultValue: 0,
            },
            max_attempts: {
                type: DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                defaultValue: 3,
            },
            payload: {
                type: DataTypes.JSON,
                allowNull: true,
            },
            started_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            finished_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            last_error: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
        },
        {
            tableName: "media_jobs",
            timestamps: true,
        }
    );

    return MediaJob;
};
