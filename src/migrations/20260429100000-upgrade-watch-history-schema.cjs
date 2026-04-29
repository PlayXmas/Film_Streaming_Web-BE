"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tableName = "watch_history";
        const table = await queryInterface.describeTable(tableName);

        if (table.progress_sec && !table.current_time_sec) {
            await queryInterface.renameColumn(tableName, "progress_sec", "current_time_sec");
        }

        const refreshedTable = await queryInterface.describeTable(tableName);

        if (!refreshedTable.current_time_sec) {
            await queryInterface.addColumn(tableName, "current_time_sec", {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0,
            });
        } else {
            await queryInterface.changeColumn(tableName, "current_time_sec", {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0,
            });
        }

        if (!refreshedTable.duration_sec) {
            await queryInterface.addColumn(tableName, "duration_sec", {
                type: Sequelize.INTEGER,
                allowNull: true,
            });
        }

        if (!refreshedTable.progress_percent) {
            await queryInterface.addColumn(tableName, "progress_percent", {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0,
            });
        }

        if (!refreshedTable.is_finished) {
            await queryInterface.addColumn(tableName, "is_finished", {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            });
        }

        await queryInterface.sequelize.query(`
            UPDATE watch_history
            SET progress_percent = CASE
                WHEN duration_sec IS NOT NULL AND duration_sec > 0
                    THEN LEAST(100, GREATEST(0, ROUND((current_time_sec / duration_sec) * 100)))
                ELSE COALESCE(progress_percent, 0)
            END
        `);

        await queryInterface.sequelize.query(`
            UPDATE watch_history
            SET is_finished = CASE
                WHEN COALESCE(progress_percent, 0) >= 90 THEN 1
                ELSE 0
            END
        `);
    },

    async down(queryInterface, Sequelize) {
        const tableName = "watch_history";
        const table = await queryInterface.describeTable(tableName);

        if (table.is_finished) {
            await queryInterface.removeColumn(tableName, "is_finished");
        }

        if (table.progress_percent) {
            await queryInterface.removeColumn(tableName, "progress_percent");
        }

        const refreshedTable = await queryInterface.describeTable(tableName);

        if (refreshedTable.current_time_sec && !refreshedTable.progress_sec) {
            await queryInterface.renameColumn(tableName, "current_time_sec", "progress_sec");
        }
    },
};
