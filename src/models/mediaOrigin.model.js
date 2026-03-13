export default (sequelize, DataTypes) => {
    const MediaOrigin = sequelize.define(
        "MediaOrigin",
        {
            id: {
                type: DataTypes.BIGINT.UNSIGNED,
                primaryKey: true,
                autoIncrement: true,
            },
            scope_type: {
                type: DataTypes.ENUM("title", "episode", "season"),
                allowNull: false,
            },
            scope_id: {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: false,
            },
            purpose: {
                type: DataTypes.ENUM("content", "trailer"),
                allowNull: false,
                defaultValue: "content",
            },
            delivery: {
                type: DataTypes.ENUM("HLS", "DASH", "MP4", "YOUTUBE"),
                allowNull: false,
            },
            audio_type: {
                type: DataTypes.ENUM("sub", "dub", "voiceover"),
                allowNull: false,
                defaultValue: "sub",
            },
            has_subtitles: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            url: {
                type: DataTypes.TEXT,
                allowNull: false,
            },
            is_active: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            is_primary: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
        },
        {
            tableName: "media_origins",
            timestamps: true,
        }
    );

    return MediaOrigin;
};
