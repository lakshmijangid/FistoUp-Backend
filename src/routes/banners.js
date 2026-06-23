const router = require('express').Router();
const Banner = require('../models/Banner');


router.get('/', async (req, res) => {
  try {
    const { position } = req.query;
    const query = { isActive: true };
    if (position) query.position = position;
    const banners = await Banner.find(query).sort({ order: 1, createdAt: -1 });
    res.json({ banners });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
