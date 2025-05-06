import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userEmail: { type: String, required: true },
  items: [{
    productId: { type: mongoose.Schema.Types.ObjectId, required: true },
    productName: { type: String, required: true },
    quantityOrdered: { type: Number, required: true },
    productPrice: { type: Number, required: true },
    totalPrice: { type: Number, required: true },
    status: { type: String, enum: ['sifting', 'sifted'], default: 'sifting' }
  }],
  grandTotal: { type: Number, required: true },
  orderedAt: { type: Date, default: Date.now }
});

export default mongoose.model("Order", orderSchema);