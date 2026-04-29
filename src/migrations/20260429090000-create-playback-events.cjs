"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("playback_events", {
            id: {
                type: Sequelize.BIGINT.UNSIGNED,
                primaryKey: true,
                autoIncrement: true,
                allowNull: false,
            },
            user_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false,
                references: {
                    model: "users",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "CASCADE",
            },
            title_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false,
                references: {
                    model: "titles",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "CASCADE",
            },
            episode_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: true,
                references: {
                    model: "episodes",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "SET NULL",
            },
            origin_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: true,
                references: {
                    model: "media_origins",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "SET NULL",
            },
            variant_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: true,
                references: {
                    model: "media_variants",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "SET NULL",
            },
            session_id: {
                type: Sequelize.STRING(128),
                allowNull: true,
            },
            event_type: {
                type: Sequelize.ENUM(
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
                type: Sequelize.INTEGER,
                allowNull: true,
            },
            duration_sec: {
                type: Sequelize.INTEGER,
                allowNull: true,
            },
            progress_percent: {
                type: Sequelize.INTEGER,
                allowNull: true,
            },
            playback_rate: {
                type: Sequelize.DECIMAL(4, 2),
                allowNull: true,
            },
            quality: {
                type: Sequelize.STRING(32),
                allowNull: true,
            },
            volume: {
                type: Sequelize.DECIMAL(5, 2),
                allowNull: true,
            },
            is_muted: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            event_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.fn("NOW"),
            },
            meta: {
                type: Sequelize.JSON,
                allowNull: true,
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.fn("NOW"),
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.fn("NOW"),
            },
        });

        await queryInterface.addIndex("playback_events", ["user_id", "event_at"], {
            name: "playback_events_user_event_at_idx",
        });
        await queryInterface.addIndex("playback_events", ["title_id", "episode_id", "event_at"], {
            name: "playback_events_title_episode_event_at_idx",
        });
        await queryInterface.addIndex("playback_events", ["session_id", "event_at"], {
            name: "playback_events_session_event_at_idx",
        });
    },

    async down(queryInterface) {
        await queryInterface.removeIndex("playback_events", "playback_events_session_event_at_idx");
        await queryInterface.removeIndex("playback_events", "playback_events_title_episode_event_at_idx");
        await queryInterface.removeIndex("playback_events", "playback_events_user_event_at_idx");
        await queryInterface.dropTable("playback_events");
    },
};
