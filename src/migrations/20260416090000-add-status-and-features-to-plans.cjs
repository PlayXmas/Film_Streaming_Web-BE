"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn("plans", "is_active", {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        });

        await queryInterface.addColumn("plans", "features", {
            type: Sequelize.JSON,
            allowNull: true,
        });

        await queryInterface.sequelize.query(
            "UPDATE plans SET features = '[]' WHERE features IS NULL"
        );

        await queryInterface.changeColumn("plans", "features", {
            type: Sequelize.JSON,
            allowNull: false,
        });
    },

    async down(queryInterface) {
        await queryInterface.removeColumn("plans", "features");
        await queryInterface.removeColumn("plans", "is_active");
    },
};
