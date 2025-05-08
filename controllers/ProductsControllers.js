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
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const { products } = req.body;
    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ message: "Products array required." });
    }

    let orderDoc = await Order.findOne({ userId: user._id });

    if (!orderDoc) {
      orderDoc = new Order({
        userId: user._id,
        userEmail: user.email,
        items: [],
        grandTotal: 0
      });
    }

    // Verify all products belong to this user
    const userProductDoc = await Product.findOne({ userId: user._id });
    if (!userProductDoc) {
      return res.status(404).json({ message: "No products found for this user." });
    }

    for (const item of products) {
      const { productId, quantity, status = 'sifting' } = item;

      if (!productId || !quantity || quantity <= 0) {
        return res.status(400).json({ message: "Invalid product data." });
      }

      // Check if product exists in user's products
      const product = userProductDoc.products.id(productId);
      if (!product) {
        return res.status(404).json({ 
          message: `Product with ID ${productId} not found in your inventory.` 
        });
      }

      if (product.productQuantity < quantity) {
        return res.status(400).json({
          message: `Not enough stock for ${product.productName}. Available: ${product.productQuantity}`
        });
      }

      // Deduct stock
      product.productQuantity -= quantity;
      
      // Create a new order item (don't merge with existing ones)
      orderDoc.items.push({
        productId: product._id,
        productName: product.productName,
        quantityOrdered: quantity,
        productPrice: product.productPrice,
        totalPrice: quantity * product.productPrice,
        status: status
      });
    }

    // Save product quantity changes
    await userProductDoc.save();

    orderDoc.grandTotal = orderDoc.items.reduce((sum, item) => sum + item.totalPrice, 0);
    const savedOrder = await orderDoc.save();

    res.status(200).json({
      message: "Order placed successfully",
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

    // Get all orders where user is the owner (userId matches)
    const orders = await Order.find({ userId: user._id })
      .sort({ orderedAt: -1 });

    // Separate items into sifting and sifted
    const formattedOrders = orders.map(order => {
      const siftingItems = order.items.filter(item => item.status === 'sifting');
      const siftedItems = order.items.filter(item => item.status === 'sifted');
      
      return {
        _id: order._id,
        userId: order.userId,
        userEmail: order.userEmail,
        siftingItems,
        siftedItems,
        grandTotal: order.grandTotal,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      };
    });

    res.status(200).json(formattedOrders);
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
        totalProductsSifting: 0,
        totalActualPrice: 0,
        totalSalesValue: 0,
        totalSiftingValue: 0,
        totalProfit: 0
      });
    }

    const orders = await Order.find({ userId: user._id });

    // Use maps for accuracy
    const soldMap = new Map();
    const siftingMap = new Map();
    const salesValues = new Map();
    const siftingValues = new Map();

    for (const order of orders) {
      for (const item of order.items) {
        const productIdStr = item.productId.toString();
        if (item.status === 'sifted') {
          soldMap.set(productIdStr, (soldMap.get(productIdStr) || 0) + item.quantityOrdered);
          salesValues.set(productIdStr, (salesValues.get(productIdStr) || 0) + item.totalPrice);
        } else if (item.status === 'sifting') {
          siftingMap.set(productIdStr, (siftingMap.get(productIdStr) || 0) + item.quantityOrdered);
          siftingValues.set(productIdStr, (siftingValues.get(productIdStr) || 0) + item.totalPrice);
        }
      }
    }

    let totalProductsInStock = 0;
    let totalProductsSold = 0;
    let totalProductsSifting = 0;
    let totalActualPrice = 0;
    let totalSalesValue = 0;
    let totalSiftingValue = 0;
    let totalProfit = 0;

    const productSummary = productDoc.products.map(product => {
      const productIdStr = product._id.toString();
      const sold = soldMap.get(productIdStr) || 0;
      const sifting = siftingMap.get(productIdStr) || 0;
      const inStock = product.productQuantity;
      const totalQuantity = inStock + sold + sifting;

      const sales = salesValues.get(productIdStr) || 0;
      const siftingVal = siftingValues.get(productIdStr) || 0;
      const actualCost = product.actualPrice * totalQuantity;
      const profit = sales - (product.actualPrice * sold);

      totalProductsInStock += inStock;
      totalProductsSold += sold;
      totalProductsSifting += sifting;
      totalActualPrice += actualCost;
      totalSalesValue += sales;
      totalSiftingValue += siftingVal;
      totalProfit += profit;

      return {
        productId: product._id,
        productName: product.productName,
        inStock,
        sold,
        sifting,
        total: totalQuantity,
        actualPrice: product.actualPrice,
        sellingPrice: product.productPrice,
        totalActualCost: actualCost,
        totalSalesValue: sales,
        totalSiftingValue: siftingVal,
        profit
      };
    });

    res.status(200).json({
      products: productSummary,
      totalProductsInStock,
      totalProductsSold,
      totalProductsSifting,
      totalActualPrice,
      totalSalesValue,
      totalSiftingValue,
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
export const completeSifting = async (req, res) => {
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

    const { orderId, itemId, quantity } = req.body;

    if (!orderId || !itemId) {
      return res.status(400).json({ message: "Order ID and Item ID are required." });
    }

    const order = await Order.findOne({
      _id: orderId,
      userId: user._id,
      "items._id": itemId
    });

    if (!order) {
      return res.status(404).json({ message: "Order or item not found for this user." });
    }

    const item = order.items.id(itemId);
    if (item.status !== 'sifting') {
      return res.status(400).json({ message: "Item is not in sifting status." });
    }

    // If quantity is provided, only mark that quantity as sifted
    if (quantity && quantity > 0) {
      if (quantity > item.quantityOrdered) {
        return res.status(400).json({ message: "Quantity cannot exceed the sifting quantity." });
      }

      // Create a new sifted item with the completed quantity
      order.items.push({
        productId: item.productId,
        productName: item.productName,
        quantityOrdered: quantity,
        productPrice: item.productPrice,
        totalPrice: quantity * item.productPrice,
        status: 'sifted'
      });

      // Reduce the original sifting item's quantity
      item.quantityOrdered -= quantity;
      
      // If no quantity left, remove the sifting item
      if (item.quantityOrdered <= 0) {
        order.items.pull(item._id);
      }
    } else {
      // If no quantity specified, mark the entire item as sifted
      item.status = 'sifted';
    }

    await order.save();

    res.status(200).json({
      message: "Sifting completed successfully",
      order: order
    });

  } catch (error) {
    res.status(500).json({ 
      message: "Server Error", 
      error: error.message 
    });
  }
};

// Search a product in user's inventory by product ID
export const searchProductById = async (req, res) => {
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

    const { productId } = req.params;
    if (!productId) {
      return res.status(400).json({ message: "Product ID is required." });
    }

    const productDoc = await Product.findOne({ userId: user._id });
    if (!productDoc) {
      return res.status(404).json({ message: "No products found for this user." });
    }

    const product = productDoc.products.id(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found in your inventory." });
    }

    res.status(200).json(product);
  } catch (error) {
    res.status(500).json({ 
      message: "Server Error", 
      error: error.message 
    });
  }
};

// Search an ordered product by order ID and item ID
export const searchOrderedProduct = async (req, res) => {
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

    const { orderId, itemId } = req.params;
    if (!orderId || !itemId) {
      return res.status(400).json({ message: "Both Order ID and Item ID are required." });
    }

    const order = await Order.findOne({
      _id: orderId,
      userId: user._id
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found for this user." });
    }

    const item = order.items.id(itemId);
    if (!item) {
      return res.status(404).json({ message: "Item not found in this order." });
    }

    res.status(200).json(item);
  } catch (error) {
    res.status(500).json({ 
      message: "Server Error", 
      error: error.message 
    });
  }
};
// Get only sifting products (orders with status 'sifting')
export const getSiftingProducts = async (req, res) => {
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

    // Find all orders for this user that have items with 'sifting' status
    const orders = await Order.find({ 
      userId: user._id,
      'items.status': 'sifting'
    });

    // Extract only the sifting items from all orders
    const siftingItems = orders.flatMap(order => 
      order.items.filter(item => item.status === 'sifting')
    );

    res.status(200).json(siftingItems);
  } catch (error) {
    res.status(500).json({ 
      message: "Server Error", 
      error: error.message 
    });
  }
};

// Get only sifted products (orders with status 'sifted')
export const getSiftedProducts = async (req, res) => {
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
    const orders = await Order.find({ 
      userId: user._id,
      'items.status': 'sifted'
    });

 
    const siftedItems = orders.flatMap(order => 
      order.items.filter(item => item.status === 'sifted')
    );

    res.status(200).json(siftedItems);
  } catch (error) {
    res.status(500).json({ 
      message: "Server Error", 
      error: error.message 
    });
  }
};

export const getSingleItems = async (req, res) => {
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
      return res.status(200).json([]);
    }
    
    const singleItems = productDoc.products.filter(
      product => product.itemType === 'singleitem'
    );
    
    res.status(200).json(singleItems);
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// Get only groupitem products
export const getGroupItems = async (req, res) => {
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
      return res.status(200).json([]);
    }
    
    const groupItems = productDoc.products.filter(
      product => product.itemType === 'groupitems'
    );
    
    res.status(200).json(groupItems);
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};