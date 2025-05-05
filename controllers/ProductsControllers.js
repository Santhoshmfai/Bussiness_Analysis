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

    const { productName, productPrice, productQuantity, type, itemType, category, productImage } = req.body;

    if(!productName || !productPrice || !itemType || !category || !productImage || !type || !productQuantity) {
        return res.status(400).json({ message: "All product fields are required" });
    }

    // Check if a product document already exists for this user
    let productDoc = await Product.findOne({ userId: user._id });

    if (!productDoc) {
      // If no product document exists, create a new one
      productDoc = new Product({
        userId: user._id,
        userEmail: user.email,
        products: []
      });
    }

    // Add the new product to the products array
    productDoc.products.push({
      productName,
      productPrice,
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
      return res.status(400).json({ message: "Invalid order request. Products array required." });
    }

    let grandTotal = 0;
    const orderItems = [];
    
    // Check for existing order of the same product
    const existingOrder = await Order.findOne({ 
      buyerId: buyer._id,
      "items.productId": products[0].productId // assuming single product per order
    });

    if (existingOrder) {
      // Update existing order
      const existingItem = existingOrder.items.find(
        item => item.productId.toString() === products[0].productId
      );

      const productDoc = await Product.findOne({ "products._id": products[0].productId });
      if (!productDoc) {
        return res.status(404).json({ message: `Product with ID ${products[0].productId} not found.` });
      }

      const product = productDoc.products.id(products[0].productId);
      if (product.productQuantity < products[0].quantity) {
        return res.status(400).json({ 
          message: `Not enough stock available for ${product.productName}. Available: ${product.productQuantity}`
        });
      }

      // Update quantity and totals
      existingItem.quantityOrdered += products[0].quantity;
      existingItem.totalPrice = existingItem.productPrice * existingItem.quantityOrdered;
      
      // Update product quantity
      product.productQuantity -= products[0].quantity;
      await productDoc.save();

      // Recalculate grand total
      existingOrder.grandTotal = existingOrder.items.reduce(
        (total, item) => total + item.totalPrice, 0
      );

      const updatedOrder = await existingOrder.save();
      return res.status(200).json({ 
        message: "Order updated successfully", 
        order: updatedOrder 
      });
    }

    // If no existing order, create new one (original code)
    for (const item of products) {
      const { productId, quantity } = item;
      
      if (!productId || !quantity || quantity <= 0) {
        return res.status(400).json({ message: "Invalid product in order request." });
      }

      const productDoc = await Product.findOne({ "products._id": productId });
      if (!productDoc) {
        return res.status(404).json({ message: `Product with ID ${productId} not found.` });
      }

      if (productDoc.userId.toString() !== buyer._id.toString()) {
        return res.status(400).json({ 
          message: "You can only order your own products."
        });
      }

      const product = productDoc.products.id(productId);
      if (product.productQuantity < quantity) {
        return res.status(400).json({ 
          message: `Not enough stock available for ${product.productName}. Available: ${product.productQuantity}`
        });
      }

      const itemTotal = product.productPrice * quantity;
      grandTotal += itemTotal;

      orderItems.push({
        productId: product._id,
        productName: product.productName,
        sellerId: productDoc.userId,
        sellerEmail: productDoc.userEmail,
        quantityOrdered: quantity,
        productPrice: product.productPrice,
        totalPrice: itemTotal
      });

      product.productQuantity -= quantity;
      await productDoc.save();
    }

    const newOrder = new Order({
      buyerId: buyer._id,
      buyerEmail: buyer.email,
      items: orderItems,
      grandTotal: grandTotal
    });

    const savedOrder = await newOrder.save();

    res.status(200).json({ 
      message: "Order placed successfully", 
      order: savedOrder 
    });

  } catch (error) {
    console.error("Order placement failed:", error);
    res.status(500).json({ 
      message: "Server Error", 
      error: error.message 
    });
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

    // Get orders where user is either buyer or seller
    const orders = await Order.find({
      $or: [
        { buyerId: user._id }, // Orders where user is the buyer
        { "items.sellerId": user._id } // Orders where user is the seller
      ]
    }).sort({ orderedAt: -1 });

    // Group orders by productId and buyerId
    const groupedOrders = {};
    orders.forEach(order => {
      order.items.forEach(item => {
        const key = `${item.productId}-${order.buyerId}`;
        if (!groupedOrders[key]) {
          groupedOrders[key] = {
            productId: item.productId,
            productName: item.productName,
            buyerId: order.buyerId,
            buyerEmail: order.buyerEmail,
            productPrice: item.productPrice,
            totalQuantity: 0,
            totalPrice: 0,
            orders: []
          };
        }
        groupedOrders[key].totalQuantity += item.quantityOrdered;
        groupedOrders[key].totalPrice += item.totalPrice;
        groupedOrders[key].orders.push({
          orderId: order._id,
          quantity: item.quantityOrdered,
          price: item.totalPrice,
          orderedAt: order.orderedAt
        });
      });
    });

    res.status(200).json({
      groupedOrders: Object.values(groupedOrders)
    });
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

    // Get all products for this user
    const productDoc = await Product.findOne({ userId: user._id });
    if (!productDoc) {
      return res.status(200).json({
        products: [],
        totalProductsInStock: 0,
        totalProductsSold: 0
      });
    }

    // Get all orders where this user is the seller
    const orders = await Order.find({ "items.sellerId": user._id });

    // Calculate sold quantities
    const soldQuantities = {};
    orders.forEach(order => {
      order.items.forEach(item => {
        if (item.sellerId.toString() === user._id.toString()) {
          const productIdStr = item.productId.toString();
          if (!soldQuantities[productIdStr]) {
            soldQuantities[productIdStr] = 0;
          }
          soldQuantities[productIdStr] += item.quantityOrdered;
        }
      });
    });

    // Prepare product summary
    const productSummary = productDoc.products.map(product => {
      const productIdStr = product._id.toString();
      const sold = soldQuantities[productIdStr] || 0;
      return {
        productId: product._id,
        productName: product.productName,
        inStock: product.productQuantity,
        sold: sold,
        total: product.productQuantity + sold
      };
    });

    // Calculate totals
    const totalProductsInStock = productSummary.reduce((sum, product) => sum + product.inStock, 0);
    const totalProductsSold = productSummary.reduce((sum, product) => sum + product.sold, 0);

    res.status(200).json({
      products: productSummary,
      totalProductsInStock,
      totalProductsSold
    });

  } catch (error) {
    res.status(500).json({ 
      message: "Server Error", 
      error: error.message 
    });
  }
};