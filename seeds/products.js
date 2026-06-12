require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Product = require('../src/models/Product');

const products = [
  {
    name: 'Ker Sangri',
    description: 'Sun-dried wild desert beans and berries — a Rajasthani superfood rich in iron and fibre, harvested from the Thar desert scrublands around Churu.',
    price: 280,
    mrp: 340,
    category: 'Superfoods',
    images: [],
    stock: 100,
    unit: 'g',
    producerName: 'Sunita Devi',
    producerVillage: 'Rajgarh',
    fromChuru: true,
    isActive: true,
  },
  {
    name: 'Organic Bajra',
    description: 'Stone-ground pearl millet grown without pesticides on rain-fed fields. High in protein, magnesium and antioxidants.',
    price: 120,
    mrp: 150,
    category: 'Grains',
    images: [],
    stock: 200,
    unit: 'kg',
    producerName: 'Ramesh Jat',
    producerVillage: 'Sardarshahar',
    fromChuru: true,
    isActive: true,
  },
  {
    name: 'Kachari Pickle',
    description: 'Tangy wild melon (kachari) pickle made using a traditional Rajasthani recipe — slow-cured in mustard oil and hand-ground spices.',
    price: 180,
    mrp: 220,
    category: 'Pickles',
    images: [],
    stock: 80,
    unit: 'g',
    producerName: 'Kamla Devi SHG',
    producerVillage: 'Sujangarh',
    fromChuru: true,
    isActive: true,
  },
  {
    name: 'Handmade Papad',
    description: 'Thin crispy papads made from urad dal and moong dal, rolled by hand and sun-dried. No preservatives.',
    price: 150,
    mrp: 180,
    category: 'Snacks',
    images: [],
    stock: 150,
    unit: 'g',
    producerName: 'Savitri SHG Group',
    producerVillage: 'Churu',
    fromChuru: true,
    isActive: true,
  },
  {
    name: 'Moong Dal Organic',
    description: 'Naturally grown split green gram from certified organic farms. Easy to digest, high in plant protein.',
    price: 200,
    mrp: 240,
    category: 'Pulses',
    images: [],
    stock: 120,
    unit: 'g',
    producerName: 'Bhagwati Devi',
    producerVillage: 'Ratangarh',
    fromChuru: true,
    isActive: true,
  },
  {
    name: 'Methi Seeds',
    description: 'Aromatic fenugreek seeds sourced directly from small-holder spice farmers. Used in tempering, curries and Ayurvedic remedies.',
    price: 90,
    mrp: 110,
    category: 'Spices',
    images: [],
    stock: 200,
    unit: 'g',
    producerName: 'Geeta Bai',
    producerVillage: 'Bidasar',
    fromChuru: true,
    isActive: true,
  },
  {
    name: 'Bandhej Dupatta',
    description: 'Hand-tied and natural-dyed Bandhej (tie-dye) dupatta in vivid Rajasthani colours. Each piece is unique.',
    price: 899,
    mrp: 1200,
    category: 'Handicrafts',
    images: [],
    stock: 30,
    unit: 'piece',
    producerName: 'Mubarak Chhipa',
    producerVillage: 'Sujangarh',
    fromChuru: true,
    isActive: true,
  },
  {
    name: 'Wood Carved Box',
    description: 'Intricately hand-carved sheesham wood box with traditional Rajasthani motifs. Ideal for jewellery or keepsakes.',
    price: 1200,
    mrp: 1600,
    category: 'Handicrafts',
    images: [],
    stock: 20,
    unit: 'piece',
    producerName: 'Nathu Lal',
    producerVillage: 'Churu',
    fromChuru: true,
    isActive: true,
  },
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  await Product.deleteMany({});
  console.log('Cleared existing products');

  const inserted = await Product.insertMany(products);
  console.log(`Seeded ${inserted.length} products`);

  await mongoose.disconnect();
  console.log('Done');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
