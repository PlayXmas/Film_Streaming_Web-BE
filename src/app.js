// src/app.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import routes from "./routes/index.js";
import "./config/db.js";
import path from "path";

// load env sớm
dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// serve static uploads
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// prefix chung cho API
app.use("/api", routes);

app.get("/", (req, res) => {
    res.send("Film backend is running");
});

export default app;
