"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface) {
        await queryInterface.addIndex(
            "reports",
            ["reporter_id", "scope_type", "scope_id", "reason", "status"],
            {
                name: "idx_reports_duplicate_guard",
            }
        );

        await queryInterface.addIndex(
            "reports",
            ["scope_type", "status", "resolution", "created_at", "id"],
            {
                name: "idx_reports_admin_scope_status_created",
            }
        );

        await queryInterface.addIndex(
            "reports",
            ["status", "resolution", "created_at", "id"],
            {
                name: "idx_reports_admin_status_created",
            }
        );
    },

    async down(queryInterface) {
        await queryInterface.removeIndex("reports", "idx_reports_admin_status_created");
        await queryInterface.removeIndex(
            "reports",
            "idx_reports_admin_scope_status_created"
        );
        await queryInterface.removeIndex("reports", "idx_reports_duplicate_guard");
    },
};
