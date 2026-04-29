"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn("media_origins", "source_file_path", {
            type: Sequelize.STRING(500),
            allowNull: true,
        });

        await queryInterface.addColumn("media_origins", "source_file_name", {
            type: Sequelize.STRING(255),
            allowNull: true,
        });

        await queryInterface.addColumn("media_origins", "hls_master_path", {
            type: Sequelize.STRING(500),
            allowNull: true,
        });

        await queryInterface.addColumn("media_origins", "processing_status", {
            type: Sequelize.ENUM("ready", "uploaded", "queued", "processing", "failed"),
            allowNull: false,
            defaultValue: "ready",
        });

        await queryInterface.addColumn("media_origins", "processing_error", {
            type: Sequelize.TEXT,
            allowNull: true,
        });

        await queryInterface.addColumn("media_origins", "duration_sec", {
            type: Sequelize.INTEGER,
            allowNull: true,
        });

        await queryInterface.addColumn("media_origins", "last_processed_at", {
            type: Sequelize.DATE,
            allowNull: true,
        });

        await queryInterface.addColumn("media_variants", "playlist_url", {
            type: Sequelize.STRING(500),
            allowNull: true,
        });

        await queryInterface.addColumn("media_variants", "width", {
            type: Sequelize.INTEGER,
            allowNull: true,
        });

        await queryInterface.addColumn("media_variants", "height", {
            type: Sequelize.INTEGER,
            allowNull: true,
        });

        await queryInterface.addColumn("media_variants", "codec_video", {
            type: Sequelize.STRING(64),
            allowNull: true,
        });

        await queryInterface.addColumn("media_variants", "codec_audio", {
            type: Sequelize.STRING(64),
            allowNull: true,
        });

        await queryInterface.createTable("media_jobs", {
            id: {
                type: Sequelize.BIGINT.UNSIGNED,
                primaryKey: true,
                autoIncrement: true,
                allowNull: false,
            },
            origin_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false,
                references: {
                    model: "media_origins",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "CASCADE",
            },
            job_type: {
                type: Sequelize.ENUM("transcode_hls"),
                allowNull: false,
                defaultValue: "transcode_hls",
            },
            status: {
                type: Sequelize.ENUM("pending", "running", "completed", "failed"),
                allowNull: false,
                defaultValue: "pending",
            },
            attempts: {
                type: Sequelize.INTEGER.UNSIGNED,
                allowNull: false,
                defaultValue: 0,
            },
            max_attempts: {
                type: Sequelize.INTEGER.UNSIGNED,
                allowNull: false,
                defaultValue: 3,
            },
            payload: {
                type: Sequelize.JSON,
                allowNull: true,
            },
            started_at: {
                type: Sequelize.DATE,
                allowNull: true,
            },
            finished_at: {
                type: Sequelize.DATE,
                allowNull: true,
            },
            last_error: {
                type: Sequelize.TEXT,
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

        await queryInterface.addIndex("media_jobs", ["status", "created_at"], {
            name: "media_jobs_status_created_at_idx",
        });

        await queryInterface.addIndex("media_jobs", ["origin_id"], {
            name: "media_jobs_origin_id_idx",
        });
    },

    async down(queryInterface) {
        await queryInterface.removeIndex("media_jobs", "media_jobs_origin_id_idx");
        await queryInterface.removeIndex("media_jobs", "media_jobs_status_created_at_idx");
        await queryInterface.dropTable("media_jobs");

        await queryInterface.removeColumn("media_variants", "codec_audio");
        await queryInterface.removeColumn("media_variants", "codec_video");
        await queryInterface.removeColumn("media_variants", "height");
        await queryInterface.removeColumn("media_variants", "width");
        await queryInterface.removeColumn("media_variants", "playlist_url");

        await queryInterface.removeColumn("media_origins", "last_processed_at");
        await queryInterface.removeColumn("media_origins", "duration_sec");
        await queryInterface.removeColumn("media_origins", "processing_error");
        await queryInterface.removeColumn("media_origins", "processing_status");
        await queryInterface.removeColumn("media_origins", "hls_master_path");
        await queryInterface.removeColumn("media_origins", "source_file_name");
        await queryInterface.removeColumn("media_origins", "source_file_path");
    },
};
