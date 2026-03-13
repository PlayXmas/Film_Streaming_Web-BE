// src/config/db.js
import { Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        dialect: "mysql",
        logging: false,
        define: {
            // Áp dụng mặc định cho TẤT CẢ model
            timestamps: true,          // mặc định có createdAt / updatedAt
            underscored: true,         // tên cột dùng snake_case (created_at)
            createdAt: "created_at",   // map field createdAt -> cột created_at
            updatedAt: "updated_at",   // map field updatedAt -> cột updated_at
        },
    }
);

export async function testConnection() {
    try {
        await sequelize.authenticate();
        console.log("DB connected successfully");
    } catch (err) {
        console.error("DB connection error:", err.message);
    }
}

export default sequelize;
export { sequelize };
