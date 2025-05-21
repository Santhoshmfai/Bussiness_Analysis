import express from "express";
import productRoutes from "./routes/productRoutes.js";
import { setupSwagger, connectDB } from './config/db.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// Middleware
app.use(express.json());

// Setup Swagger
setupSwagger(app);

// Routes
app.use("/api", productRoutes);

// Connect to MongoDB
connectDB();

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API Documentation: http://localhost:${PORT}/api-docs`);
});