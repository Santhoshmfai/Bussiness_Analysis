import User from "../models/UserModel.js";
import Product from "../models/ProductModel.js";
import Order from "../models/OrderModel.js";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import bcrypt from 'bcryptjs';
dotenv.config();

export const signup = async (req, res) => {
  try {
      const { businessName, email, password, businessType } = req.body;

      if (!businessName || !email || !password || !businessType) {
          return res.status(400).json({ error: "All fields are required." });
      }

      const existingUser = await User.findOne({ $or: [{ businessName }, { email }] });
      if (existingUser) {
          return res.status(400).json({ error: "Business name or Email already exists." });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = new User({ businessName, email, password: hashedPassword, businessType });
      await newUser.save();

      const token = jwt.sign(
          { id: newUser._id, businessName: newUser.businessName, email: newUser.email }, 
          process.env.JWT_SECRET,
          { expiresIn: "1h" }
      );

      res.status(201).json({ message: "User registered successfully!", token });
  } catch (error) {
      console.error("Signup Error:", error);
      res.status(500).json({ error: "Internal server error" });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;

  try {
      const user = await User.findOne({ email });

      if (!user) {
          return res.status(400).json({ error: "Email not found" });
      }

      const isPasswordMatch = await bcrypt.compare(password, user.password);
      if (!isPasswordMatch) {
          return res.status(400).json({ error: "Wrong password" });
      }

      const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "1h" });

      res.status(200).json({ message: "Login successful", token, email: user.email });
  } catch (error) {
      res.status(500).json({ error: "Server error", details: error.message });
  }
};
export const createProduct = async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized: No token provided." });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const { productName, productPrice, actualPrice, productQuantity, type, itemType, category, productImage } = req.body;

    if(!productName || !productPrice || !actualPrice || !itemType || !category || !productImage || !type || !productQuantity) {
        return res.status(400).json({ message: "All product fields are required" });
    }

    let productDoc = await Product.findOne({ userId: user._id });

    if (!productDoc) {
      productDoc = new Product({
        userId: user._id,
        userEmail: user.email,
        products: []
      });
    }

    productDoc.products.push({
      productName,
      productPrice,
      actualPrice,
      productQuantity,
      type,
      itemType,
      category,
      productImage
    });
   
    const savedProduct = await productDoc.save();
    res.status(201).json(savedProduct);
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
}
export const getAllProducts = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "Unauthorized: No token provided." });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Get the single product document for this user
    const productDoc = await Product.findOne({ userId: user._id });
    
    if (!productDoc) {
      return res.status(200).json([]); // Return empty array if no products found
    }
    
    res.status(200).json(productDoc.products);
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};
export const placeOrder = async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized: No token provided." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const buyer = await User.findById(decoded.id);
    if (!buyer) {
      return res.status(404).json({ message: "User not found." });
    }

    const { products } = req.body;
    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ message: "Products array required." });
    }

    let orderDoc = await Order.findOne({ buyerId: buyer._id });

    if (!orderDoc) {
      orderDoc = new Order({
        buyerId: buyer._id,
        buyerEmail: buyer.email,
        items: [],
        grandTotal: 0
      });
    }

    for (const item of products) {
      const { productId, quantity } = item;

      if (!productId || !quantity || quantity <= 0) {
        return res.status(400).json({ message: "Invalid product data." });
      }

      const productDoc = await Product.findOne({ "products._id": productId });
      if (!productDoc) {
        return res.status(404).json({ message: `Product with ID ${productId} not found.` });
      }

      // Check if the product belongs to the buyer (email match)
      if (productDoc.userEmail !== buyer.email) {
        return res.status(403).json({ 
          message: `You can only order products that you created. Product ${productId} belongs to another user.` 
        });
      }

      const product = productDoc.products.id(productId);
      if (product.productQuantity < quantity) {
        return res.status(400).json({
          message: `Not enough stock for ${product.productName}. Available: ${product.productQuantity}`
        });
      }

      // Deduct stock
      product.productQuantity -= quantity;
      await productDoc.save();

      const existingItem = orderDoc.items.find(
        i => i.productId.toString() === productId
      );

      if (existingItem) {
        existingItem.quantityOrdered += quantity;
        existingItem.totalPrice = existingItem.quantityOrdered * existingItem.productPrice;
      } else {
        orderDoc.items.push({
          productId: product._id,
          productName: product.productName,
          sellerId: productDoc.userId,
          sellerEmail: productDoc.userEmail,
          quantityOrdered: quantity,
          productPrice: product.productPrice,
          totalPrice: quantity * product.productPrice
        });
      }
    }

    orderDoc.grandTotal = orderDoc.items.reduce((sum, item) => sum + item.totalPrice, 0);
    const savedOrder = await orderDoc.save();

    res.status(200).json({
      message: "Order placed or updated successfully",
      order: savedOrder
    });

  } catch (error) {
    console.error("Order placement error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export const getAllOrders = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Unauthorized: No token provided." });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Get all orders where user is either buyer or seller
    const orders = await Order.find({
      $or: [
        { buyerId: user._id },
        { "items.sellerId": user._id }
      ]
    }).sort({ orderedAt: -1 });

    res.status(200).json(orders);
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};
export const getProductSummary = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "Unauthorized: No token provided." });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const productDoc = await Product.findOne({ userId: user._id });
    if (!productDoc) {
      return res.status(200).json({
        products: [],
        totalProductsInStock: 0,
        totalProductsSold: 0,
        totalActualPrice: 0,
        totalSalesValue: 0,
        totalProfit: 0
      });
    }

    const orders = await Order.find({ "items.sellerId": user._id });

    const soldQuantities = {};
    const salesValues = {};
    orders.forEach(order => {
      order.items.forEach(item => {
        if (item.sellerId.toString() === user._id.toString()) {
          const productIdStr = item.productId.toString();
          if (!soldQuantities[productIdStr]) {
            soldQuantities[productIdStr] = 0;
            salesValues[productIdStr] = 0;
          }
          soldQuantities[productIdStr] += item.quantityOrdered;
          salesValues[productIdStr] += item.totalPrice;
        }
      });
    });

    let totalActualPrice = 0;
    let totalSalesValue = 0;
    let totalProfit = 0;

    const productSummary = productDoc.products.map(product => {
      const productIdStr = product._id.toString();
      const sold = soldQuantities[productIdStr] || 0;
      const productSalesValue = salesValues[productIdStr] || 0;
      const productActualCost = product.actualPrice * sold;
      const productProfit = productSalesValue - productActualCost;
      
      totalActualPrice += product.actualPrice * (product.productQuantity + sold);
      totalSalesValue += productSalesValue;
      totalProfit += productProfit;

      return {
        productId: product._id,
        productName: product.productName,
        inStock: product.productQuantity,
        sold: sold,
        total: product.productQuantity + sold,
        actualPrice: product.actualPrice,
        sellingPrice: product.productPrice,
        totalActualCost: product.actualPrice * (product.productQuantity + sold),
        totalSalesValue: productSalesValue,
        profit: productProfit
      };
    });

    const totalProductsInStock = productSummary.reduce((sum, product) => sum + product.inStock, 0);
    const totalProductsSold = productSummary.reduce((sum, product) => sum + product.sold, 0);

    res.status(200).json({
      products: productSummary,
      totalProductsInStock,
      totalProductsSold,
      totalActualPrice,
      totalSalesValue,
      totalProfit
    });

  } catch (error) {
    res.status(500).json({ 
      message: "Server Error", 
      error: error.message 
    });
  }
};
export const addSameProduct = async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized: No token provided." });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const { productId, additionalQuantity } = req.body;

    if (!productId || !additionalQuantity || additionalQuantity <= 0) {
      return res.status(400).json({ message: "Product ID and valid additional quantity are required" });
    }

    // Find the product document for this user
    const productDoc = await Product.findOne({ userId: user._id });
    if (!productDoc) {
      return res.status(404).json({ message: "No products found for this user." });
    }

    // Find the specific product in the products array
    const productIndex = productDoc.products.findIndex(
      p => p._id.toString() === productId
    );

    if (productIndex === -1) {
      return res.status(404).json({ message: "Product not found." });
    }

    // Update the product quantity
    productDoc.products[productIndex].productQuantity += additionalQuantity;

    const updatedProduct = await productDoc.save();
    
    res.status(200).json({
      message: "Product quantity updated successfully",
      product: updatedProduct.products[productIndex]
    });
  } catch (error) {
    res.status(500).json({ 
      message: "Server Error", 
      error: error.message 
    });
  }
}