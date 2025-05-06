import mongoose from "mongoose";

const ProductSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    userEmail: { type: String, required: true },
    products: [{
        productName: { type: String, required: true },
        productPrice: { type: Number, required: true },
        actualPrice: { type: Number, required: true },
        productQuantity: { type: Number, required: true },
        type: { type: String, required: true },
        itemType: { type: String, required: true },
        category: { type: String, required: true },
        productImage: { type: String, required: true }
    }]
});

export default mongoose.model("Product", ProductSchema);