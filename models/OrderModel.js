import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
  buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  buyerEmail: { type: String, required: true },
  items: [{
    productId: { type: mongoose.Schema.Types.ObjectId, required: true }, 
    productName: { type: String, required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sellerEmail: { type: String, required: true },
    quantityOrdered: { type: Number, required: true },
    productPrice: { type: Number, required: true },
    totalPrice: { type: Number, required: true }
  }],
  grandTotal: { type: Number, required: true },
  orderedAt: { type: Date, default: Date.now }
});

export default mongoose.model("Order", orderSchema);