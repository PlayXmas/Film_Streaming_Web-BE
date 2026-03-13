// src/models/vEpisodeEffectiveAccess.model.js
export default (sequelize, DataTypes) => {
    const VEpisodeEffectiveAccess = sequelize.define(
        "VEpisodeEffectiveAccess",
        {
            episode_id: {
                type: DataTypes.BIGINT.UNSIGNED,
                primaryKey: true,
            },
            effective_tier: DataTypes.ENUM("free", "vip"),
        },
        {
            tableName: "v_episode_effective_access",
            timestamps: false,
        }
    );

    return VEpisodeEffectiveAccess;
};
