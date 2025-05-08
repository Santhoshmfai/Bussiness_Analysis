import express from "express";
import { createProduct ,getAllProducts,placeOrder,getAllOrders,getProductSummary ,signup ,login ,addSameProduct ,completeSifting ,searchOrderedProduct ,searchProductById ,
    getSiftingProducts,getSiftedProducts ,getSingleItems ,getGroupItems} from "../controllers/ProductsControllers.js";
import { verifyToken } from "../middlewares/authMiddleware.js";

const router = express.Router();


router.post("/signup", signup);
router.post("/login", login);

router.post("/CreateProducts",verifyToken, createProduct);
router.post("/addSameProduct",verifyToken, addSameProduct);
router.get("/GetAllProducts",verifyToken,  getAllProducts);

router.post("/OrderItem",verifyToken,  placeOrder);
router.get("/getAllOrders",verifyToken,  getAllOrders);

router.get("/getSummary",verifyToken,  getProductSummary );

router.post("/completeSifted",verifyToken,  completeSifting );

router.get("/search-products/:productId", verifyToken, searchProductById);
router.get("/search-orders/:orderId/items/:itemId", verifyToken, searchOrderedProduct);

router.get("/SiftingProduct", verifyToken, getSiftingProducts);
router.get("/SiftedProducts", verifyToken, getSiftedProducts);

router.get("/getOnlySingleItems", verifyToken, getSingleItems);
router.get("/getOnlyGroupItems", verifyToken, getGroupItems);

export default router;
