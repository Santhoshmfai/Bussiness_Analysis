import express from "express";
import mongoose from "mongoose";
import productRoutes from "./routes/productRoutes.js";

const app = express();

// Middleware
app.use(express.json());

// Routes
app.use("/api", productRoutes);

// MongoDB connection
mongoose.connect("mongodb://localhost:27017/your-db-name", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log("MongoDB connected"))
.catch(err => console.log("MongoDB connection error:", err));

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
