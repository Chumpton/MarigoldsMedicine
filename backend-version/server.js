const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'db.json');

// Check if running inside backend-version and adjust static file serving
const PUBLIC_DIR = fs.existsSync(path.join(__dirname, 'index.html')) ? __dirname : path.join(__dirname, '..');

app.use(express.json());
app.use(express.static(PUBLIC_DIR));

const DEFAULT_COPY = {
  "nav_brand": "Marigold's Medicine",
  "hero_heading": "A Place to Be Seen",
  "hero_subheading": "Meet Marigold Merced, your intuitive guide. Discover clarity, alignment, and mystical insight through minimalist spreads and profound universal wisdom.",
  "hero_cta": "Connect with Marigold",
  "free_title": "Get a Free Instant Tarot Reading",
  "free_description": "Enter your email to instantly draw a Major Arcana card and receive a personalized guidance message.",
  "free_button": "Draw My Card <i class=\"fa-solid fa-wand-magic-sparkles ml-1\"></i>",
  "process_title": "My Tarot Process",
  "process_p1": "My approach to tarot is grounded in clarity, intuition, and minimalist elegance. I view the cards not as tools for rigid fortune-telling, but as mirrors reflecting your inner truth and the energies surrounding you.",
  "process_p2": "Each reading begins with a grounding meditation, aligning our intentions. We pull the cards together, unraveling the narrative they present. Whether you are seeking immediate guidance or deep spiritual mapping, the process is always a collaborative, illuminating journey.",
  "about_title": "Marigold Merced",
  "about_subtitle": "Founder & Intuitive Guide",
  "about_bio": "Bio currently under construction...",
  "contact_title": "Request a Reading",
  "contact_process_title": "The Process",
  "contact_process_text": "Every reading is a tailored experience designed to illuminate your unique path. We begin by centering our energies and clarifying your intention. Using intuitive spreads, we will unravel the narrative of the cards, connecting deeply with the elements and your personal astrology to uncover actionable, profound insights.",
  "contact_benefits_title": "Included Benefits",
  "contact_benefit_1": "A personalized, deep-dive tarot spread",
  "contact_benefit_2": "Integration of your celestial chart energies",
  "contact_benefit_3": "A radically inclusive, empathetic space for grounding",
  "contact_benefit_4": "Written summary and high-quality photo of your spread",
  "live_card_title": "Live Session",
  "live_card_subtitle": "Calendly Scheduler",
  "live_card_description": "Meet 1-on-1 with Marigold in a live Zoom meeting. Explore your cards interactively and ask questions in real-time.",
  "live_card_button": "Book Live Call",
  "recorded_card_title": "Recorded Video",
  "recorded_card_subtitle": "Pre-Recorded Readings",
  "recorded_card_description": "Choose from our curated menu of pre-recorded Tarot spreads and receive a private high-definition video reading sent to your email.",
  "recorded_card_button": "Explore Spreads"
};

// DB Helper Functions & In-Memory Cache for Serverless Environments
let dbCache = null;

function readDb() {
  if (dbCache) {
    return dbCache;
  }
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    const db = JSON.parse(data);
    if (!db.copy || Object.keys(db.copy).length === 0) {
      db.copy = DEFAULT_COPY;
      try {
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
      } catch (writeErr) {
        console.warn('Warning: Could not seed copy property to local db.json file:', writeErr.message);
      }
    }
    dbCache = db;
    return db;
  } catch (err) {
    console.error('Error reading database file, creating a fresh one', err);
    const initialDb = {
      credentials: { username: "admin", password: "admin" },
      availability: {
        weekly: { "0": [], "1": [], "2": [], "3": [], "4": [], "5": [], "6": [] },
        blockouts: []
      },
      bookings: [],
      readings: [],
      services: [],
      shop: [],
      copy: DEFAULT_COPY
    };
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(initialDb, null, 2));
    } catch (writeErr) {
      console.warn('Warning: Could not create fresh local db.json file:', writeErr.message);
    }
    dbCache = initialDb;
    return initialDb;
  }
}

function pushToGitHub(dbData) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO; // e.g. "Chumpton/MarigoldsMedicine"
  const filePath = 'backend-version/db.json';
  
  if (!token || !repo) {
    console.log("GitHub sync skipped: GITHUB_TOKEN or GITHUB_REPO env variables not set.");
    return;
  }
  
  const contentBase64 = Buffer.from(JSON.stringify(dbData, null, 2)).toString('base64');
  
  // Step 1: Get the current file SHA
  const getOptions = {
    hostname: 'api.github.com',
    path: `/repos/${repo}/contents/${filePath}`,
    method: 'GET',
    headers: {
      'User-Agent': 'Marigold-CMS-Sync',
      'Authorization': `token ${token}`
    }
  };
  
  const req = https.request(getOptions, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      let sha = '';
      if (res.statusCode === 200) {
        const fileInfo = JSON.parse(data);
        sha = fileInfo.sha;
      }
      
      // Step 2: Push the updated file content
      const putData = JSON.stringify({
        message: 'chore(db): update database configurations [skip ci]',
        content: contentBase64,
        sha: sha || undefined
      });
      
      const putOptions = {
        hostname: 'api.github.com',
        path: `/repos/${repo}/contents/${filePath}`,
        method: 'PUT',
        headers: {
          'User-Agent': 'Marigold-CMS-Sync',
          'Authorization': `token ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(putData)
        }
      };
      
      const putReq = https.request(putOptions, (putRes) => {
        let putResult = '';
        putRes.on('data', chunk => putResult += chunk);
        putRes.on('end', () => {
          if (putRes.statusCode === 200 || putRes.statusCode === 201) {
            console.log("GitHub API Sync: Successfully committed db.json to repository.");
          } else {
            console.error(`GitHub API Sync: Failed with status ${putRes.statusCode}`, putResult);
          }
        });
      });
      
      putReq.on('error', (err) => console.error("GitHub API Sync: Error during write request:", err));
      putReq.write(putData);
      putReq.end();
    });
  });
  
  req.on('error', (err) => console.error("GitHub API Sync: Error fetching file metadata:", err));
  req.end();
}

function writeDb(data) {
  // Update in-memory cache so subsequent requests read the updated state immediately
  dbCache = data;

  // 1. Attempt writing to local filesystem (fails safely on Vercel without blocking GitHub sync)
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn('Warning: Local database write failed (expected on serverless environments like Vercel):', err.message);
  }

  // 2. GitHub API Push (Vercel Serverless mode)
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_REPO) {
    console.log("GitHub API credentials detected. Syncing db.json to repository...");
    pushToGitHub(data);
  }
  // 3. Local Git CLI Push Fallback (Self-hosted VM mode)
  else if (process.env.AUTO_GIT_PUSH === 'true') {
    console.log("AUTO_GIT_PUSH is active. Running local git commit and push...");
    exec('git add db.json && git commit -m "chore(db): save copy and panel settings via host console" && git push', (err, stdout, stderr) => {
      if (err) {
        console.error("Auto Git Push execution failed:", err);
      } else {
        console.log("Auto Git Push success:", stdout);
      }
    });
  }
}

// Convert "HH:MM" string to minutes from start of day
function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

// Convert minutes from start of day to "HH:MM" string
function minutesToTime(mins) {
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// Helper to determine service duration and name from db
function getServiceDetails(db, type) {
  const service = db.services.find(s => s.id === type);
  if (service) {
    return {
      duration: service.duration,
      typeName: `${service.name} ($${service.price})`,
      price: service.price
    };
  }
  // Default values
  return {
    duration: 60,
    typeName: 'Custom Tarot Reading ($85)',
    price: 85
  };
}

// CRM & Analytics dynamic compilation helpers
function computeCrmAndAnalytics(db) {
  const clientMap = {};
  let totalRevenue = 0;
  const bookingsByType = {};

  // Initialize booking types counts
  db.services.forEach(s => {
    bookingsByType[s.id] = 0;
  });

  // 1. Process Live Calendly Bookings
  db.bookings.forEach(booking => {
    const sDetails = getServiceDetails(db, booking.type);
    totalRevenue += sDetails.price;
    
    if (bookingsByType[booking.type] !== undefined) {
      bookingsByType[booking.type]++;
    } else {
      bookingsByType[booking.type] = 1;
    }

    const email = booking.email.toLowerCase().trim();
    if (!clientMap[email]) {
      clientMap[email] = {
        name: booking.name,
        email: booking.email,
        zodiac: 'TBD',
        totalBookings: 0,
        totalReadings: 0,
        totalSpend: 0,
        notes: []
      };
    }
    clientMap[email].totalBookings++;
    clientMap[email].totalSpend += sDetails.price;
    if (booking.notes) {
      clientMap[email].notes.push(`[Meeting ${booking.date}]: ${booking.notes}`);
    }
  });

  // 2. Process Recorded Readings
  db.readings.forEach(reading => {
    const price = reading.price ? Number(reading.price) : 15;
    totalRevenue += price;

    const email = reading.email.toLowerCase().trim();
    if (!clientMap[email]) {
      clientMap[email] = {
        name: reading.name,
        email: reading.email,
        zodiac: reading.zodiac,
        totalBookings: 0,
        totalReadings: 0,
        totalSpend: 0,
        notes: []
      };
    }
    clientMap[email].totalReadings++;
    clientMap[email].totalSpend += price;
    if (reading.zodiac && clientMap[email].zodiac === 'TBD') {
      clientMap[email].zodiac = reading.zodiac;
    }
    if (reading.question) {
      clientMap[email].notes.push(`[Recorded Reading]: ${reading.question}`);
    }
  });

  const clients = Object.values(clientMap);
  const analytics = {
    totalRevenue,
    totalBookingsCount: db.bookings.length,
    totalReadingsCount: db.readings.length,
    bookingsByType
  };

  return { clients, analytics };
}


// --- API ENDPOINTS ---

// A. Auth API
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const db = readDb();
  
  if (db.credentials && db.credentials.username === username && db.credentials.password === password) {
    res.json({ success: true, token: 'authenticated-host' });
  } else {
    res.status(401).json({ error: 'Incorrect username or password. Please try again.' });
  }
});


// B. Dynamic Services APIs
app.get('/api/services', (req, res) => {
  const db = readDb();
  res.json(db.services || []);
});

// Admin Authorization Middleware
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized: Missing administrative credentials.' });
  }
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
  if (token !== 'authenticated-host') {
    return res.status(401).json({ error: 'Unauthorized: Invalid administrative credentials.' });
  }
  next();
};

// Protect all administrative routes
app.use('/api/admin', authMiddleware);

app.post('/api/admin/services', (req, res) => {
  const { id, name, duration, price, description, icon } = req.body;
  if (!id || !name || !duration || !price || !description) {
    return res.status(400).json({ error: 'Missing required service parameters.' });
  }

  const db = readDb();
  
  // Prevent duplicate IDs
  if (db.services.some(s => s.id === id)) {
    return res.status(400).json({ error: 'A service with this ID key already exists.' });
  }

  const newService = {
    id,
    name,
    duration: Number(duration),
    price: Number(price),
    description,
    icon: icon || 'fa-sparkles'
  };

  db.services.push(newService);
  writeDb(db);
  res.status(201).json(newService);
});

app.delete('/api/admin/services/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const index = db.services.findIndex(s => s.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Service not found.' });
  }

  db.services.splice(index, 1);
  writeDb(db);
  res.json({ success: true });
});


// C. Dynamic Shop APIs
app.get('/api/shop', (req, res) => {
  const db = readDb();
  res.json(db.shop || []);
});

app.post('/api/admin/shop', (req, res) => {
  const { name, price, description, image } = req.body;
  if (!name || !price || !description) {
    return res.status(400).json({ error: 'Missing required shop item parameters.' });
  }

  const db = readDb();
  const newProduct = {
    id: `p-${crypto.randomUUID().slice(0,8)}`,
    name,
    price: Number(price),
    description,
    image: image || ''
  };

  db.shop.push(newProduct);
  writeDb(db);
  res.status(201).json(newProduct);
});

app.delete('/api/admin/shop/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const index = db.shop.findIndex(p => p.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  db.shop.splice(index, 1);
  writeDb(db);
  res.json({ success: true });
});


// D. Public Slot availability
app.get('/api/availability', (req, res) => {
  const { date } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Valid date parameter (YYYY-MM-DD) is required.' });
  }

  const db = readDb();
  
  if (db.availability.blockouts.includes(date)) {
    return res.json({ date, slots: [] });
  }

  const dateObj = new Date(date + 'T00:00:00');
  const dayOfWeek = dateObj.getDay();
  const dailyRanges = db.availability.weekly[String(dayOfWeek)] || [];

  if (dailyRanges.length === 0) {
    return res.json({ date, slots: [] });
  }

  const potentialSlots = [];
  dailyRanges.forEach(range => {
    const rangeStart = timeToMinutes(range.start);
    const rangeEnd = timeToMinutes(range.end);
    for (let current = rangeStart; current < rangeEnd; current += 30) {
      potentialSlots.push(current);
    }
  });

  const bookingsOnDate = db.bookings.filter(b => b.date === date);
  const availableSlots = potentialSlots.filter(slotMinutes => {
    const slotStart = slotMinutes;
    const slotEnd = slotMinutes + 30;

    for (const booking of bookingsOnDate) {
      const bookStart = timeToMinutes(booking.time);
      const bookEnd = bookStart + booking.duration;
      if (slotStart < bookEnd && slotEnd > bookStart) {
        return false;
      }
    }
    
    // Past check
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    if (date === todayStr) {
      const currentMins = now.getHours() * 60 + now.getMinutes();
      if (slotStart <= currentMins + 15) {
        return false;
      }
    }

    return true;
  });

  const formattedSlots = availableSlots.map(minutesToTime);
  res.json({ date, slots: formattedSlots });
});


// E. Create Booking Session
app.post('/api/bookings', (req, res) => {
  const { name, email, type, date, time, notes } = req.body;
  if (!name || !email || !type || !date || !time) {
    return res.status(400).json({ error: 'Missing required booking parameters.' });
  }

  const db = readDb();
  const sDetails = getServiceDetails(db, type);
  const duration = sDetails.duration;
  const typeName = sDetails.typeName;

  const newBookingStart = timeToMinutes(time);
  const newBookingEnd = newBookingStart + duration;

  if (db.availability.blockouts.includes(date)) {
    return res.status(400).json({ error: 'Selected date is blocked off.' });
  }

  const dateObj = new Date(date + 'T00:00:00');
  const dayOfWeek = dateObj.getDay();
  const dailyRanges = db.availability.weekly[String(dayOfWeek)] || [];
  let inRange = false;
  for (const range of dailyRanges) {
    const rangeStart = timeToMinutes(range.start);
    const rangeEnd = timeToMinutes(range.end);
    if (newBookingStart >= rangeStart && newBookingEnd <= rangeEnd) {
      inRange = true;
      break;
    }
  }

  if (!inRange) {
    return res.status(400).json({ error: 'Selected time is outside working hours.' });
  }

  const bookingsOnDate = db.bookings.filter(b => b.date === date);
  for (const booking of bookingsOnDate) {
    const bStart = timeToMinutes(booking.time);
    const bEnd = bStart + booking.duration;
    if (newBookingStart < bEnd && newBookingEnd > bStart) {
      return res.status(400).json({ error: 'This time slot is already booked.' });
    }
  }

  // Generate unique Zoom Link
  const meetingId = Math.floor(1000000000 + Math.random() * 9000000000);
  const password = crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
  const zoomLink = `https://zoom.us/j/${meetingId}?pwd=${password}`;

  const newBooking = {
    id: `b-${crypto.randomUUID()}`,
    name,
    email,
    type,
    typeName,
    date,
    time,
    duration,
    zoomLink,
    notes: notes || '',
    createdAt: new Date().toISOString()
  };

  db.bookings.push(newBooking);
  writeDb(db);

  res.status(201).json(newBooking);
});


// F. Reschedule Booking Session (Admin only)
app.post('/api/admin/reschedule-booking', (req, res) => {
  const { id, date, time } = req.body;
  if (!id || !date || !time) {
    return res.status(400).json({ error: 'Missing reschedule parameters.' });
  }

  const db = readDb();
  const booking = db.bookings.find(b => b.id === id);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found.' });
  }

  const duration = booking.duration;
  const newStart = timeToMinutes(time);
  const newEnd = newStart + duration;

  // Validate working hours
  const dateObj = new Date(date + 'T00:00:00');
  const dayOfWeek = dateObj.getDay();
  const dailyRanges = db.availability.weekly[String(dayOfWeek)] || [];
  let inRange = false;
  for (const range of dailyRanges) {
    const rangeStart = timeToMinutes(range.start);
    const rangeEnd = timeToMinutes(range.end);
    if (newStart >= rangeStart && newEnd <= rangeEnd) {
      inRange = true;
      break;
    }
  }

  if (!inRange) {
    return res.status(400).json({ error: 'Selected time is outside operating hours for this day.' });
  }

  // Validate conflicts, ignoring current booking itself
  const bookingsOnDate = db.bookings.filter(b => b.date === date && b.id !== id);
  for (const other of bookingsOnDate) {
    const otherStart = timeToMinutes(other.time);
    const otherEnd = otherStart + other.duration;
    if (newStart < otherEnd && newEnd > otherStart) {
      return res.status(400).json({ error: 'Reschedule conflict: This slot is already booked.' });
    }
  }

  // Apply change
  booking.date = date;
  booking.time = time;
  booking.notes = (booking.notes || '') + `\n[Rescheduled by Admin to ${date} ${time}]`;

  writeDb(db);
  res.json({ success: true, booking });
});


// G. Create recorded reading request
app.post('/api/readings', (req, res) => {
  const { name, email, zodiac, question, readingType, price } = req.body;
  if (!name || !email || !zodiac || !question) {
    return res.status(400).json({ error: 'Missing required recorded reading requirements.' });
  }

  const db = readDb();

  const newReading = {
    id: `r-${crypto.randomUUID()}`,
    name,
    email,
    zodiac,
    question,
    readingType: readingType || 'Single-Question Guidance',
    price: price ? Number(price) : 25,
    status: 'pending',
    deliveryUrl: null,
    createdAt: new Date().toISOString(),
    deliveredAt: null
  };

  db.readings.push(newReading);
  writeDb(db);

  res.status(201).json(newReading);
});


// H. Admin Dashboard Core Data Call (Retrieves logs, configs, and pre-compiled LTV/CRM sets)
app.get('/api/admin/data', (req, res) => {
  const db = readDb();
  
  // Dynamically compile LTV/CRM lists and gross revenues
  const { clients, analytics } = computeCrmAndAnalytics(db);

  res.json({
    bookings: db.bookings,
    readings: db.readings,
    availability: db.availability,
    services: db.services || [],
    shop: db.shop || [],
    copy: db.copy || {},
    clients,
    analytics
  });
});

// H2. Website Copy endpoints
app.get('/api/copy', (req, res) => {
  const db = readDb();
  res.json(db.copy || DEFAULT_COPY);
});

app.post('/api/admin/copy', (req, res) => {
  const copy = req.body;
  if (!copy || Object.keys(copy).length === 0) {
    return res.status(400).json({ error: 'Invalid or empty website copy configuration parameters.' });
  }
  
  const db = readDb();
  db.copy = copy;
  writeDb(db);
  res.json({ success: true, copy: db.copy });
});

// I. Admin availability settings
app.post('/api/admin/availability', (req, res) => {
  const { weekly, blockouts } = req.body;
  if (!weekly || !blockouts) {
    return res.status(400).json({ error: 'Invalid availability parameters.' });
  }

  const db = readDb();
  db.availability = { weekly, blockouts };
  writeDb(db);

  res.json({ success: true, availability: db.availability });
});

// J. Admin deliver order
app.post('/api/admin/deliver', (req, res) => {
  const { id, deliveryUrl } = req.body;
  if (!id || !deliveryUrl) {
    return res.status(400).json({ error: 'Missing ID or delivery URL.' });
  }

  const db = readDb();
  const reading = db.readings.find(r => r.id === id);
  if (!reading) {
    return res.status(404).json({ error: 'Recorded reading request not found.' });
  }

  reading.status = 'delivered';
  reading.deliveryUrl = deliveryUrl;
  reading.deliveredAt = new Date().toISOString();

  writeDb(db);
  res.json({ success: true, reading });
});

// K. Admin Delete Booking
app.post('/api/admin/delete-booking', (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Missing booking ID.' });
  }

  const db = readDb();
  const index = db.bookings.findIndex(b => b.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Booking not found.' });
  }

  db.bookings.splice(index, 1);
  writeDb(db);
  res.json({ success: true });
});


// L. Wildcard Serve
app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});


app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`Marigold Merced Portal listening on port ${PORT}`);
  console.log(`Public Booking Calendar: http://localhost:${PORT}/booking.html`);
  console.log(`Recorded Readings Menu : http://localhost:${PORT}/#/gig`);
  console.log(`Login Interface       : http://localhost:${PORT}/login.html`);
  console.log(`Admin Console Panel   : http://localhost:${PORT}/admin.html`);
  console.log(`==================================================`);
});
