import express from 'express';
import { AuthRequest, authenticateToken, requireAdmin } from '../middleware/auth';
import { fallbackProducts } from '../controllers/fallbackData';

const router = express.Router();

// Get all products
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    let products;
    
    if (req.dbConnected && req.prisma) {
      products = await req.prisma.product.findMany({
        where: { available: true },
        orderBy: { operator: 'asc' }
      });
    } else {
      // Fallback approach
      products = fallbackProducts.filter((product: any) => product.available);
    }

    // Group products by operator and category
    const groupedProducts = products.reduce((acc: any, product) => {
      if (!acc[product.operator]) {
        acc[product.operator] = {};
      }
      if (!acc[product.operator][product.category]) {
        acc[product.operator][product.category] = [];
      }
      acc[product.operator][product.category].push(product);
      return acc;
    }, {});

    res.json({ products: groupedProducts });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Get product by ID
router.get('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    let product;
    
    if (req.dbConnected && req.prisma) {
      product = await req.prisma.product.findUnique({
        where: { id: parseInt(req.params.id) }
      });
    } else {
      // Fallback approach
      product = fallbackProducts.find((p: any) => p.id === parseInt(req.params.id));
    }

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ product });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// Create product (admin only)
router.post('/', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { operator, category, name, priceMMK, priceCr } = req.body;

    let product;
    
    if (req.dbConnected && req.prisma) {
      product = await req.prisma.product.create({
        data: {
          operator,
          category,
          name,
          priceMMK: parseInt(priceMMK),
          priceCr: parseInt(priceCr)
        }
      });
    } else {
      // Fallback approach - add to memory array
      product = {
        id: Math.max(...fallbackProducts.map((p: any) => p.id)) + 1,
        operator,
        category,
        name,
        priceMMK: parseInt(priceMMK),
        priceCr: parseInt(priceCr),
        available: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      fallbackProducts.push(product);
    }

    res.status(201).json({ product });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Update product (admin only)
router.put('/:id', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { operator, category, name, priceMMK, priceCr, available } = req.body;

    const product = await req.prisma.product.update({
      where: { id: parseInt(req.params.id) },
      data: {
        operator,
        category,
        name,
        priceMMK: parseInt(priceMMK),
        priceCr: parseInt(priceCr),
        available
      }
    });

    res.json({ product });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete product (admin only)
router.delete('/:id', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    await req.prisma.product.delete({
      where: { id: parseInt(req.params.id) }
    });

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

export default router;