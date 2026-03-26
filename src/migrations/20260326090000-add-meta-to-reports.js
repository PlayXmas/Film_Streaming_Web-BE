"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn("reports", "meta", {
            type: Sequelize.JSON,
            allowNull: true,
            after: "note",
        });

        await queryInterface.addIndex("reports", ["scope_type", "scope_id", "status"], {
            name: "idx_reports_scope_status",
        });

        await queryInterface.addIndex("reports", ["reporter_id", "status"], {
            name: "idx_reports_reporter_status",
        });
    },

    async down(queryInterface) {
        await queryInterface.removeIndex("reports", "idx_reports_reporter_status");
        await queryInterface.removeIndex("reports", "idx_reports_scope_status");
        await queryInterface.removeColumn("reports", "meta");
    },
};
