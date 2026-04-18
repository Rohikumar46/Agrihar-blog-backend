const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

dotenv.config({ path: path.join(__dirname, '.env') });

const authRoutes = require('./routes/authRoutes');
const blogRoutes = require('./routes/blogRoutes');
const publicBlogRoutes = require('./routes/publicBlogRoutes');
const adminBlogModerationRoutes = require('./routes/adminBlogModerationRoutes');
const authorRoutes = require('./routes/authorRoutes');

const app = express();

const PORT = Number(process.env.PORT) || 5000;
const MONGO_URI = process.env.MONGO_URI;
const MONGO_URI_ATLAS = process.env.MONGO_URI_ATLAS;
const SELECTED_MONGO_URI = MONGO_URI_ATLAS || MONGO_URI;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 200;

// Support wildcard, a single origin, or a comma-separated list of origins.
// Example: CORS_ORIGIN=https://agrihar-blog-frontend.vercel.app,http://localhost:3000
function buildCorsOrigin(raw) {
  if (raw === '*') return true;
  const list = raw.split(',').map((o) => o.trim()).filter(Boolean);
  return list.length === 1 ? list[0] : list;
}

app.disable('x-powered-by');
app.use(helmet());
app.use(
  cors({
    origin: buildCorsOrigin(CORS_ORIGIN),
    credentials: true,
  })
);
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));
app.use(morgan('dev'));
app.use(
  rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/blog', publicBlogRoutes);
app.use('/api/admin', adminBlogModerationRoutes);
app.use('/api/author', authorRoutes);

app.get('/', (req, res) => {
  res.send('Agrihar blog backend is running');
});

const dbStatus = {
  isConnected: false,
  uriSource: MONGO_URI_ATLAS ? 'MONGO_URI_ATLAS' : MONGO_URI ? 'MONGO_URI' : 'not_set',
  lastConnectedAt: null,
  lastError: null,
  lastErrorAt: null,
};

app.get('/health', (req, res) => {
  const statusCode = dbStatus.isConnected ? 200 : 503;

  res.status(statusCode).json({
    service: 'agrihar-backend',
    server: 'up',
    database: dbStatus.isConnected ? 'connected' : 'disconnected',
    dbSource: dbStatus.uriSource,
    lastConnectedAt: dbStatus.lastConnectedAt,
    lastError: dbStatus.lastError,
    lastErrorAt: dbStatus.lastErrorAt,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.get('/ready', (req, res) => {
  if (!dbStatus.isConnected) {
    return res.status(503).json({ ready: false, reason: 'database_disconnected' });
  }

  return res.status(200).json({ ready: true });
});

async function connectToDatabase() {
  if (!SELECTED_MONGO_URI) {
    dbStatus.lastError = 'No database URI found. Set MONGO_URI or MONGO_URI_ATLAS in .env';
    dbStatus.lastErrorAt = new Date().toISOString();
    console.warn(dbStatus.lastError);
    return;
  }

  try {
    await mongoose.connect(SELECTED_MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });
  } catch (error) {
    dbStatus.isConnected = false;
    dbStatus.lastError = error.message;
    dbStatus.lastErrorAt = new Date().toISOString();
    console.error('MongoDB connection error:', error.message);
  }
}

async function seedSuperAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = (process.env.ADMIN_PASSWORD || '').trim();

  if (!email || !password) {
    return;
  }

  try {
    const SuperAdmin = require('./models/SuperAdmin');
    const existing = await SuperAdmin.findOne({ email });

    if (existing) {
      return;
    }

    await SuperAdmin.create({ email, password });
    console.log(`SuperAdmin seeded: ${email}`);
  } catch (err) {
    console.error('SuperAdmin seed error:', err.message);
  }
}

async function seedFeaturedBlog() {
  const SLUG = 'how-agro-tourism-is-transforming-rural-indias-economy';
  try {
    const Blog = require('./models/Blog');
    const existing = await Blog.findOne({ slug: SLUG });
    if (existing) return;

    await Blog.create({
      title: "How Agro Tourism is Transforming Rural India's Economy",
      subTitle: 'Farm stays, rural trails, and hands-on harvest experiences are giving farmers a second income — and travellers a new story to tell.',
      slug: SLUG,
      category: 'agro-tourism',
      authorName: 'Priya Sharma',
      authorImage: 'https://ui-avatars.com/api/?name=Priya+Sharma&background=2d5a27&color=fff&size=128',
      imageUrl: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1400&h=800&fit=crop',
      excerpt: 'Discover how farm stays and agro-tourism experiences are creating new income streams for farmers across 12 states.',
      tags: ['agro-tourism', 'rural-economy', 'farm-stays', 'india'],
      isPublished: true,
      status: 'approved',
      content: `<h2>A New Chapter for Indian Agriculture</h2>
<p>For generations, the Indian farmer has faced a single, unrelenting pressure: make the land pay. Monsoons, market prices, and middlemen have long dictated the rhythms of rural life. But across twelve states — from the terraced tea estates of Sikkim to the sunflower fields of Karnataka — a quiet revolution is underway. Agro tourism is turning farms into destinations, and farmers into hosts.</p>

<p>The numbers tell a compelling story. According to the Ministry of Tourism's 2023 rural tourism survey, agro-tourism ventures registered a 38 percent year-on-year growth in visitor footfall, with Maharashtra alone hosting over 4.5 lakh tourists at farm-stay properties. Average supplementary income for participating households crossed ₹1.2 lakh per year — nearly doubling what a comparable rain-fed plot would earn in a single season.</p>

<h2>What Agro Tourism Actually Looks Like</h2>
<p>Strip away the brochure language and agro tourism is straightforward: city families pay to spend a weekend or a week doing what farm families do every day. They wake before sunrise to milk buffaloes, wade into paddy fields at transplanting time, press sugarcane through a wooden kolhu, or pick strawberries by the kilogram in Mahabaleshwar. The experience is the product.</p>

<p>Ramesh Patil runs a 12-acre farm outside Pune that has welcomed visitors for the past six years. "In the beginning I was embarrassed," he admits. "I thought — why would anyone pay to do the work I am tired of doing?" The answer arrived with his first group: a family of four from Bengaluru who had never seen a paddy field. They left with muddy feet, two kilograms of fresh tomatoes, and a promise to return. They have come back every monsoon since.</p>

<h2>Income Beyond the Harvest</h2>
<p>The financial logic is simple but powerful. A kilogram of tomatoes sold wholesale fetches ₹8–12. Sold to a tourist who picks it themselves, experiences the farm, and eats a home-cooked meal, the same tomato anchors a ₹1,500-per-head day package. Suddenly, an acre of tomatoes is not just a commodity — it is an experience economy.</p>

<p>Beyond direct earnings, agro tourism builds markets for value-added products. Farms that receive visitors consistently sell more pickles, cold-pressed oils, organic jaggery, and handloom goods than comparable farms without tourism operations. The guest becomes a brand ambassador, sharing photographs and recommendations that no advertising budget could buy.</p>

<h2>Government Support and Certification</h2>
<p>Recognising the sector's potential, several state governments have introduced dedicated agro-tourism policies. Maharashtra's Agro Tourism Development Corporation (ATDC) has certified more than 1,200 farms and trained over 3,000 farm hosts in hospitality, food safety, and digital marketing. Kerala's Responsible Tourism (RT) Mission has integrated agro-tourism nodes into its rural livelihood programme, ensuring that income reaches women's self-help groups as well as landowners.</p>

<p>The central government's PRDP (Pradhan Mantri Rural Development Programme) now includes a dedicated agro-tourism cluster component, providing ₹25–50 lakh in infrastructure grants to groups of five or more farms that form cooperative tourism circuits. Early adopters in Himachal Pradesh's apple belt have used this funding to build trek routes, install composting toilets, and train local youth as nature guides.</p>

<h2>Challenges Ahead</h2>
<p>The growth story is real, but it is not without friction. Connectivity remains the most cited barrier: farms in truly remote areas struggle to attract visitors who are unwilling to drive four hours on a kaccha road. Digital payment infrastructure, basic accommodation standards, and food-handling certification are inconsistently available. And the peak tourism season — winter and school holidays — often clashes with the farm's own labour crunch at harvest time.</p>

<p>There is also the question of authenticity. As agro tourism scales, the risk of it becoming a theme-park version of farm life grows. Visitors who travel hoping for genuine rural connection are quick to sense — and photograph — anything that feels staged. The farms that succeed long-term are those where tourism is woven into real agricultural operations, not built on top of them as a performance.</p>

<h2>The Road Forward</h2>
<p>India has approximately 146 million farm holdings. Even if one percent of them developed a modest agro-tourism offering, that would represent 1.46 million new rural enterprises. The potential is staggering — and the barriers, while real, are not insurmountable.</p>

<p>Technology is a key enabler. Platforms like Farmstay India, StayWithFarmers, and several state-government portals now allow farmers to list their properties, manage bookings, and receive digital payments. Social media has made it possible for a small farm in Nashik to reach a young professional in Hyderabad who has never heard of the village but will drive six hours for the right experience.</p>

<p>For Priya Mehta, who manages a lavender and herb farm in Himachal Pradesh's Kangra valley, the transformation has been personal as much as financial. "My children used to be embarrassed that we were farmers," she says. "Now they bring their college friends here for the weekend. The farm gave our family identity. Tourism gave it pride."</p>

<p>That pride — quiet, rooted, earned — may be agro tourism's most important export of all.</p>`,
    });
    console.log('Featured hero blog seeded:', SLUG);
  } catch (err) {
    console.error('Featured blog seed error:', err.message);
  }
}

mongoose.connection.on('connected', () => {
  dbStatus.isConnected = true;
  dbStatus.lastConnectedAt = new Date().toISOString();
  dbStatus.lastError = null;
  dbStatus.lastErrorAt = null;
  console.log('MongoDB connected');
  seedSuperAdmin();
  seedFeaturedBlog();
});

mongoose.connection.on('disconnected', () => {
  dbStatus.isConnected = false;
  console.warn('MongoDB disconnected');
});

mongoose.connection.on('error', (error) => {
  dbStatus.isConnected = false;
  dbStatus.lastError = error.message;
  dbStatus.lastErrorAt = new Date().toISOString();
});

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const statusCode = error.statusCode || 500;

  return res.status(statusCode).json({
    message: error.message || 'Internal server error',
  });
});

let isShuttingDown = false;

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  connectToDatabase();
});

function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`${signal} received. Shutting down gracefully...`);

  server.close(async () => {
    try {
      await mongoose.connection.close();
      console.log('MongoDB connection closed');
    } catch (error) {
      console.error('Error while closing MongoDB connection:', error.message);
    } finally {
      process.exit(0);
    }
  });

  setTimeout(() => {
    console.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
