"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("user_search_logs", {
            id: {
                type: Sequelize.BIGINT.UNSIGNED,
                primaryKey: true,
                autoIncrement: true,
                allowNull: false,
            },
            user_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: true,
                references: {
                    model: "users",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "SET NULL",
            },
            session_id: {
                type: Sequelize.STRING(128),
                allowNull: true,
            },
            keyword: {
                type: Sequelize.STRING(255),
                allowNull: false,
            },
            normalized_keyword: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            result_count: {
                type: Sequelize.INTEGER.UNSIGNED,
                allowNull: true,
            },
            filters: {
                type: Sequelize.JSON,
                allowNull: true,
            },
            source: {
                type: Sequelize.ENUM("submit", "click"),
                allowNull: false,
                defaultValue: "submit",
            },
            clicked_title_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: true,
                references: {
                    model: "titles",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "SET NULL",
            },
            searched_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.fn("NOW"),
            },
            clicked_at: {
                type: Sequelize.DATE,
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

        await queryInterface.addIndex("user_search_logs", ["user_id", "searched_at"], {
            name: "user_search_logs_user_searched_at_idx",
        });
        await queryInterface.addIndex("user_search_logs", ["session_id", "searched_at"], {
            name: "user_search_logs_session_searched_at_idx",
        });
        await queryInterface.addIndex("user_search_logs", ["normalized_keyword", "searched_at"], {
            name: "user_search_logs_keyword_searched_at_idx",
        });
        await queryInterface.addIndex("user_search_logs", ["clicked_title_id"], {
            name: "user_search_logs_clicked_title_idx",
        });
    },

    async down(queryInterface) {
        await queryInterface.removeIndex("user_search_logs", "user_search_logs_clicked_title_idx");
        await queryInterface.removeIndex("user_search_logs", "user_search_logs_keyword_searched_at_idx");
        await queryInterface.removeIndex("user_search_logs", "user_search_logs_session_searched_at_idx");
        await queryInterface.removeIndex("user_search_logs", "user_search_logs_user_searched_at_idx");
        await queryInterface.dropTable("user_search_logs");
    },
};
