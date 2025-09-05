import express from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { fallbackProducts, fallbackOrders, fallbackUsers } from '../controllers/fallbackData';

const router = express.Router();

// Get user's orders
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    let orders;
    
    if (req.dbConnected && req.prisma) {
      orders = await req.prisma.order.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: 'desc' }
      });
    } else {
      // Fallback approach
      orders = fallbackOrders.filter((order: any) => order.userId === req.user!.id)
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    res.json({ orders });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Create credit purchase order
router.post('/credit', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { amount, proofImage } = req.body;

    if (!amount || amount < 1000) {
      return res.status(400).json({ error: 'Minimum credit amount is 1000 MMK' });
    }

    let order;
    
    if (req.dbConnected && req.prisma) {
      order = await req.prisma.order.create({
        data: {
          userId: req.user!.id,
          type: 'CREDIT',
          amount: parseInt(amount),
          proofImage,
          status: 'PENDING'
        }
      });

      // Send notification to admin
      await req.prisma.user.updateMany({
        where: { isAdmin: true },
        data: {
          notifications: {
            push: `💰 Credit Request: ${req.user!.username} requests ${amount} MMK via KPay.`
          }
        }
      });
    } else {
      // Fallback approach
      order = {
        id: Date.now(),
        userId: req.user!.id,
        type: 'CREDIT',
        amount: parseInt(amount),
        proofImage,
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      fallbackOrders.push(order);
      
      // Add notification to admin users
      fallbackUsers.forEach((user: any) => {
        if (user.isAdmin) {
          user.notifications.push(`💰 Credit Request: ${req.user!.username} requests ${amount} MMK via KPay.`);
        }
      });
    }

    res.status(201).json({ 
      order,
      message: 'Credit purchase request submitted successfully' 
    });
  } catch (error) {
    console.error('Create credit order error:', error);
    res.status(500).json({ error: 'Failed to create credit order' });
  }
});

// Create product purchase order
router.post('/product', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required' });
    }

    let product, user;
    
    if (req.dbConnected && req.prisma) {
      // Database approach
      product = await req.prisma.product.findUnique({
        where: { id: parseInt(productId) }
      });
      
      user = await req.prisma.user.findUnique({
        where: { id: req.user!.id }
      });
    } else {
      // Fallback approach
      product = fallbackProducts.find((p: any) => p.id === parseInt(productId));
      user = fallbackUsers.find((u: any) => u.id === req.user!.id);
    }

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.credits < product.priceCr) {
      return res.status(400).json({ error: 'Insufficient credits' });
    }

    if (req.dbConnected && req.prisma) {
      // Database transaction
      await req.prisma.$transaction(async (prisma) => {
        await prisma.user.update({
          where: { id: req.user!.id },
          data: { credits: { decrement: product!.priceCr } }
        });

        await prisma.order.create({
          data: {
            userId: req.user!.id,
            type: 'PRODUCT',
            amount: product!.priceCr,
            productId: productId.toString(),
            status: 'APPROVED'
          }
        });
      });

      // Send notification to admin
      await req.prisma.user.updateMany({
        where: { isAdmin: true },
        data: {
          notifications: {
            push: `🛒 Product Order: ${req.user!.username} ordered ${product.name}`
          }
        }
      });
    } else {
      // Fallback transaction
      user.credits -= product.priceCr;
      
      const order = {
        id: Date.now(),
        userId: req.user!.id,
        type: 'PRODUCT',
        amount: product.priceCr,
        productId: productId.toString(),
        status: 'APPROVED',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      fallbackOrders.push(order);
      
      // Add notification to admin users
      fallbackUsers.forEach((u: any) => {
        if (u.isAdmin) {
          u.notifications.push(`🛒 Product Order: ${req.user!.username} ordered ${product.name}`);
        }
      });
    }

    res.status(201).json({ 
      message: `Product order placed successfully. ${product.priceCr} credits deducted.` 
    });
  } catch (error) {
    console.error('Create product order error:', error);
    res.status(500).json({ error: 'Failed to create product order' });
  }
});

export default router;