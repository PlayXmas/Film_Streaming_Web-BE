// src/models/mediaVariant.model.js
export default (sequelize, DataTypes) => {
    const MediaVariant = sequelize.define(
        "MediaVariant",
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
            quality: {
                type: DataTypes.ENUM("240p", "360p", "480p", "720p", "1080p", "2k", "4k"),
                allowNull: false,
            },
            required_tier: {
                type: DataTypes.ENUM("free", "vip"),
                allowNull: false,
                defaultValue: "free",
            },
            bitrate_kbps: { type: DataTypes.INTEGER },
            playlist_url: { type: DataTypes.STRING(500), allowNull: true },
            width: { type: DataTypes.INTEGER, allowNull: true },
            height: { type: DataTypes.INTEGER, allowNull: true },
            codec_video: { type: DataTypes.STRING(64), allowNull: true },
            codec_audio: { type: DataTypes.STRING(64), allowNull: true },
        },
        {
            tableName: "media_variants",
            timestamps: true,
        }
    );

    return MediaVariant;
};
