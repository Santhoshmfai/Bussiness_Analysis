import express from "express";
import { createProduct ,getAllProducts,placeOrder,getAllOrders,getProductSummary ,signup } from "../controllers/ProductsControllers.js";
import { verifyToken } from "../middlewares/authMiddleware.js";

const router = express.Router();


router.post("/signup", signup);
router.post("/CreateProducts",verifyToken, createProduct);
router.get("/GetAllProducts",verifyToken,  getAllProducts);
router.post("/OrderItem",verifyToken,  placeOrder);
router.get("/getAllOrders",verifyToken,  getAllOrders);
router.get("/getSummary",verifyToken,  getProductSummary );

export default router;
