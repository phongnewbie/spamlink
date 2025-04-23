const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const XLSX = require("xlsx");
const User = require("./models/User");
const LinkInfo = require("./models/LinkInfo");
const VisitInfo = require("./models/VisitInfo");
const auth = require("./middleware/auth");
const geoip = require("geoip-lite");
const axios = require("axios");
const path = require("path");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// CORS configuration
const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Handle preflight requests
app.options("*", cors(corsOptions));

// MongoDB connection
const MONGODB_URI =
  process.env.MONGODB_URI ||
  process.env.MONGODBI ||
  "mongodb://localhost:27017/spamlink";

console.log(
  "Attempting to connect to MongoDB with URI:",
  MONGODB_URI.replace(
    /mongodb\+srv:\/\/([^:]+):([^@]+)@/,
    "mongodb+srv://[username]:[password]@"
  )
);

mongoose
  .connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    retryWrites: true,
    w: "majority",
  })
  .then(() => console.log("MongoDB connected successfully"))
  .catch((err) => {
    console.error("MongoDB connection error details:", {
      message: err.message,
      code: err.code,
      name: err.name,
      stack: err.stack,
    });
  });

// Add security headers middleware
app.use((req, res, next) => {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains"
  );
  next();
});

// Middleware to handle all requests
app.use((req, res, next) => {
  // Log all incoming requests
  console.log("Incoming request:", {
    method: req.method,
    url: req.url,
    host: req.headers.host,
    headers: req.headers,
  });

  // Check if request is coming from n-cep.com domain
  const host = req.headers.host;
  if (host && (host.endsWith(".n-cep.com") || host === "n-cep.com")) {
    // Extract subdomain from host
    const subdomain = host.split(".")[0];
    console.log("Processing subdomain:", subdomain);

    if (subdomain !== "www" && subdomain !== "n-cep") {
      // Rewrite URL to use tracking endpoint
      const originalUrl = req.url;
      req.url = `/r/${subdomain}`;
      console.log("Rewriting URL:", { originalUrl, newUrl: req.url });
    }
  }
  next();
});

// Serve static files from the React app
app.use(express.static(path.join(__dirname, "../frontend/customerweb/build")));

// Root route handler
app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "../frontend/customerweb/build", "index.html")
  );
});

// Routes
app.post("/api/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    console.log("Registration attempt:", { username, email }); // Log registration attempt

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      console.log("User already exists:", { email, username });
      return res.status(400).json({ message: "User already exists" });
    }

    // Create new user
    const user = new User({ username, email, password });
    console.log("Creating new user:", { username, email });

    try {
      await user.save();
      console.log("User saved successfully:", { id: user._id });
    } catch (saveError) {
      console.error("Error saving user:", saveError);
      throw saveError;
    }

    // Generate token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "24h",
    });

    res.status(201).json({
      message: "User registered successfully",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res
      .status(500)
      .json({ message: "Error registering user", error: error.message });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log("Login attempt:", { email }); // Add logging

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      console.log("User not found:", { email });
      return res
        .status(401)
        .json({ message: "Email hoặc mật khẩu không đúng" });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      console.log("Invalid password for user:", { email });
      return res
        .status(401)
        .json({ message: "Email hoặc mật khẩu không đúng" });
    }

    // Generate token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "24h",
    });

    console.log("Login successful:", { email });
    res.json({
      message: "Đăng nhập thành công",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Login error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    res.status(500).json({
      message: "Lỗi đăng nhập",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Vui lòng thử lại sau",
    });
  }
});

app.get("/api/profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password");
    res.json(user);
  } catch (error) {
    console.error("Profile fetch error:", error);
    res
      .status(500)
      .json({ message: "Error fetching profile", error: error.message });
  }
});

// Add new link
app.post("/api/linkInfo", auth, async (req, res) => {
  try {
    const { originalUrl, subdomain, url, features } = req.body;

    // Check if subdomain already exists
    const existingLink = await LinkInfo.findOne({ subdomain });
    if (existingLink) {
      return res.status(400).json({ message: "Subdomain already exists" });
    }

    const linkInfo = new LinkInfo({
      subdomain,
      originalUrl,
      url,
      features,
      reportedBy: req.user.userId,
      userId: req.user.userId,
    });

    await linkInfo.save();

    res.status(201).json({
      message: "Link created successfully",
      link: linkInfo,
    });
  } catch (error) {
    console.error("Error creating link:", error);
    res
      .status(500)
      .json({ message: "Error creating link", error: error.message });
  }
});

// Get user's links
app.get("/api/linkInfo", auth, async (req, res) => {
  try {
    const links = await LinkInfo.find({ reportedBy: req.user.userId }).sort({
      createdAt: -1,
    });

    res.json(links);
  } catch (error) {
    console.error("Error fetching links:", error);
    res
      .status(500)
      .json({ message: "Error fetching links", error: error.message });
  }
});

// Delete link
app.delete("/api/linkInfo/:id", auth, async (req, res) => {
  try {
    const link = await LinkInfo.findOneAndDelete({
      _id: req.params.id,
      reportedBy: req.user.userId,
    });

    if (!link) {
      return res.status(404).json({ message: "Link not found" });
    }

    res.json({ message: "Link deleted successfully" });
  } catch (error) {
    console.error("Error deleting link:", error);
    res
      .status(500)
      .json({ message: "Error deleting link", error: error.message });
  }
});

// Handle subdomain requests
app.get("/r/:subdomain", async (req, res) => {
  try {
    const subdomain = req.params.subdomain;
    console.log("Looking for subdomain:", subdomain);

    const link = await LinkInfo.findOne({ subdomain });
    console.log("Found link:", link);

    if (!link) {
      return res.status(404).send("Link not found");
    }

    // Get visitor's real IP
    // Get visitor's real IP
    let ip;
    if (req.headers["x-forwarded-for"]) {
      // Lấy IP đầu tiên trong chuỗi x-forwarded-for (IP thực của client)
      ip = req.headers["x-forwarded-for"].split(",")[0].trim();
    } else if (req.headers["cf-connecting-ip"]) {
      // IP từ Cloudflare
      ip = req.headers["cf-connecting-ip"];
    } else if (req.headers["x-real-ip"]) {
      // IP thực từ Nginx
      ip = req.headers["x-real-ip"];
    } else {
      // IP từ kết nối trực tiếp
      ip = req.connection.remoteAddress;
      // Xử lý IPv6 localhost
      if (ip === "::1" || ip === "::ffff:127.0.0.1") {
        ip = "127.0.0.1";
      }
    }

    console.log("Raw headers:", req.headers);
    console.log("Detected IP:", ip);

    console.log("Raw headers:", req.headers);
    console.log("Detected IP:", ip);

    // Get detailed country information using ipapi.co
    let countryInfo = {};
    try {
      const response = await axios.get(`https://ipapi.co/${ip}/json/`);
      console.log("IP API Response:", response.data);
      countryInfo = {
        country: response.data.country_name,
        countryCode: response.data.country_code,
        region: response.data.region,
        city: response.data.city,
        timezone: response.data.timezone,
        currency: response.data.currency,
        languages: response.data.languages,
        callingCode: response.data.country_calling_code,
      };
    } catch (geoError) {
      console.error("Error getting country info:", geoError);
      const geo = geoip.lookup(ip);
      countryInfo = {
        country: geo ? geo.country : "Unknown",
        countryCode: geo ? geo.country : "Unknown",
      };
    }

    console.log("Country Info:", countryInfo);

    // Save visit information
    const visitInfo = new VisitInfo({
      ip: ip, // Lưu IP thực đã phát hiện
      country: countryInfo.country,
      countryCode: countryInfo.countryCode,
      region: countryInfo.region,
      city: countryInfo.city,
      timezone: countryInfo.timezone,
      currency: countryInfo.currency,
      languages: countryInfo.languages,
      callingCode: countryInfo.callingCode,
      link: link._id,
      userAgent: req.headers["user-agent"],
      via: {
        browser: req.headers["user-agent"],
        platform: req.headers["sec-ch-ua-platform"],
        mobile: req.headers["sec-ch-ua-mobile"],
        language: req.headers["accept-language"],
        referrer: req.headers["referer"] || "direct",
      },
    });

    await visitInfo.save();
    console.log("Visit saved:", visitInfo);

    // Render spam page with redirect
    const redirectDelay = 5000; // 5 seconds delay
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${link.features?.spamTitle || "Loading..."}</title>
          <meta property="og:title" content="${
            link.features?.spamTitle || "Loading..."
          }" />
          <meta property="og:description" content="${
            link.features?.spamContent || ""
          }" />
          <meta property="og:image" content="${
            link.features?.shareImage || ""
          }" />
          <style>
            body {
              margin: 0;
              padding: 0;
              font-family: Arial, sans-serif;
              background: #f5f5f5;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
            }
            .container {
              text-align: center;
              padding: 20px;
              background: white;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              max-width: 500px;
              width: 90%;
            }
            .title {
              font-size: 24px;
              color: #333;
              margin-bottom: 10px;
            }
            .content {
              font-size: 16px;
              color: #666;
              margin-bottom: 20px;
            }
            .image {
              max-width: 100%;
              height: auto;
              border-radius: 4px;
              margin-bottom: 20px;
            }
            .redirect-message {
              font-size: 14px;
              color: #999;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <img src="${
              link.features?.loginImage || ""
            }" alt="Preview" class="image" />
            <h1 class="title">${link.features?.spamTitle || "Loading..."}</h1>
            <p class="content">${link.features?.spamContent || ""}</p>
            <p class="redirect-message">Redirecting in ${
              redirectDelay / 1000
            } seconds...</p>
          </div>
          <script>
            setTimeout(function() {
              window.location.href = "${link.originalUrl}";
            }, ${redirectDelay});
          </script>
        </body>
      </html>
    `;

    res.send(html);
  } catch (error) {
    console.error("Error handling visit:", error);
    res.status(500).send("Error processing request");
  }
});

// Get visit stats for a link
app.get("/api/linkInfo/:id/stats", auth, async (req, res) => {
  try {
    const link = await LinkInfo.findOne({
      _id: req.params.id,
      reportedBy: req.user.userId,
    });

    if (!link) {
      return res.status(404).json({ message: "Link not found" });
    }

    const stats = link.getVisitStats();
    res.json(stats);
  } catch (error) {
    console.error("Error getting stats:", error);
    res
      .status(500)
      .json({ message: "Error getting stats", error: error.message });
  }
});

// Endpoint để lấy thống kê via
app.get("/api/linkInfo/stats/all", auth, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Lấy tất cả link của user
    const userLinks = await LinkInfo.find({ userId });
    const linkIds = userLinks.map((link) => link._id);

    // Lấy visits từ VisitInfo collection trong 24h qua
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Sử dụng MongoDB aggregation để lấy unique visits
    const uniqueVisits = await VisitInfo.aggregate([
      {
        $match: {
          link: { $in: linkIds },
          createdAt: { $gte: oneDayAgo },
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $group: {
          _id: {
            ip: "$ip",
            link: "$link",
            timeWindow: {
              $subtract: [
                { $toLong: "$createdAt" },
                { $mod: [{ $toLong: "$createdAt" }, 1800000] },
              ],
            },
          },
          createdAt: { $first: "$createdAt" },
          country: { $first: "$country" },
          city: { $first: "$city" },
        },
      },
    ]);

    // Tính tổng số via (unique)
    const totalVisits = uniqueVisits.length;

    // Thống kê theo quốc gia (unique)
    const countryStats = {};
    uniqueVisits.forEach((visit) => {
      const country = visit.country || "Unknown";
      countryStats[country] = (countryStats[country] || 0) + 1;
    });

    // Đếm số người online (unique trong 5 phút gần nhất)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const onlineVisits = uniqueVisits.filter(
      (v) => new Date(v.createdAt) >= fiveMinutesAgo
    );
    const onlineCount = onlineVisits.length;

    // Thống kê online theo quốc gia (unique)
    const onlineByCountry = {};
    onlineVisits.forEach((visit) => {
      const country = visit.country || "Unknown";
      onlineByCountry[country] = (onlineByCountry[country] || 0) + 1;
    });

    res.json({
      totalVisits,
      countryStats,
      onlineCount,
      onlineByCountry,
    });
  } catch (error) {
    console.error("Error getting stats:", error);
    res.status(500).json({ message: "Error fetching statistics" });
  }
});

// Endpoint để tải về via theo quốc gia
app.get("/api/linkInfo/stats/download/:country", auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { country } = req.params;

    const userLinks = await LinkInfo.find({ userId });
    const linkIds = userLinks.map((link) => link._id);

    const visits = await VisitInfo.find({
      link: { $in: linkIds },
      country: country,
    })
      .sort({ createdAt: -1 })
      .select("ip userAgent createdAt country via");

    // Chuẩn bị dữ liệu cho Excel
    const excelData = visits.map((v) => ({
      ID: v._id.toString(),
      "IP Address": v.ip
        ? v.ip.replace(/\./g, ":") + "." + v.country.toUpperCase()
        : "N/A",
      "User Agent": v.userAgent || "N/A",
      Browser: v.via?.browser || "N/A",
      Platform: v.via?.platform || "N/A",
      Mobile: v.via?.mobile || "N/A",
      Language: v.via?.language || "N/A",
      Referrer: v.via?.referrer || "N/A",
      Time: new Date(v.createdAt).toLocaleString(),
    }));

    // Tạo workbook và worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);

    // Điều chỉnh độ rộng cột
    const colWidths = [
      { wch: 15 }, // ID
      { wch: 20 }, // IP Address
      { wch: 100 }, // User Agent
      { wch: 20 }, // Browser
      { wch: 15 }, // Platform
      { wch: 10 }, // Mobile
      { wch: 15 }, // Language
      { wch: 30 }, // Referrer
      { wch: 20 }, // Time
    ];
    ws["!cols"] = colWidths;

    // Thêm worksheet vào workbook
    XLSX.utils.book_append_sheet(wb, ws, `Via ${country}`);

    // Tạo buffer
    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });

    // Gửi file
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=via_${country}_${
        new Date().toISOString().split("T")[0]
      }.xlsx`
    );
    res.send(excelBuffer);
  } catch (error) {
    console.error("Error downloading stats:", error);
    res.status(500).json({ message: "Error downloading statistics" });
  }
});

// Endpoint để tải về toàn bộ via
app.get("/api/linkInfo/stats/download", auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userLinks = await LinkInfo.find({ userId });
    const linkIds = userLinks.map((link) => link._id);

    const visits = await VisitInfo.find({
      link: { $in: linkIds },
    })
      .sort({ createdAt: -1 })
      .select("ip userAgent createdAt country via");

    // Nhóm dữ liệu theo quốc gia
    const visitsByCountry = {};
    visits.forEach((visit) => {
      const country = visit.country || "Unknown";
      if (!visitsByCountry[country]) {
        visitsByCountry[country] = [];
      }
      visitsByCountry[country].push({
        ID: visit._id.toString(),
        "IP Address": visit.ip
          ? visit.ip.replace(/\./g, ":") + "." + country.toUpperCase()
          : "N/A",
        "User Agent": visit.userAgent || "N/A",
        Browser: visit.via?.browser || "N/A",
        Platform: visit.via?.platform || "N/A",
        Mobile: visit.via?.mobile || "N/A",
        Language: visit.via?.language || "N/A",
        Referrer: visit.via?.referrer || "N/A",
        Time: new Date(visit.createdAt).toLocaleString(),
      });
    });

    // Tạo workbook
    const wb = XLSX.utils.book_new();

    // Tạo worksheet cho mỗi quốc gia
    Object.entries(visitsByCountry).forEach(([country, countryVisits]) => {
      const ws = XLSX.utils.json_to_sheet(countryVisits);

      // Điều chỉnh độ rộng cột
      const colWidths = [
        { wch: 15 }, // ID
        { wch: 20 }, // IP Address
        { wch: 100 }, // User Agent
        { wch: 20 }, // Browser
        { wch: 15 }, // Platform
        { wch: 10 }, // Mobile
        { wch: 15 }, // Language
        { wch: 30 }, // Referrer
        { wch: 20 }, // Time
      ];
      ws["!cols"] = colWidths;

      // Thêm worksheet vào workbook
      XLSX.utils.book_append_sheet(wb, ws, country);
    });

    // Tạo buffer
    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });

    // Gửi file
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=all_via_${
        new Date().toISOString().split("T")[0]
      }.xlsx`
    );
    res.send(excelBuffer);
  } catch (error) {
    console.error("Error downloading all stats:", error);
    res.status(500).json({ message: "Error downloading statistics" });
  }
});

// Endpoint để xóa toàn bộ via
app.delete("/api/linkInfo/stats/clear", auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userLinks = await LinkInfo.find({ userId });
    const linkIds = userLinks.map((link) => link._id);

    await VisitInfo.deleteMany({ linkId: { $in: linkIds } });
    res.json({ message: "All visit data cleared" });
  } catch (error) {
    console.error("Error clearing stats:", error);
    res.status(500).json({ message: "Error clearing statistics" });
  }
});

// Get visit statistics for a link
app.get("/api/links/:linkId/stats", auth, async (req, res) => {
  try {
    const { linkId } = req.params;

    // Verify link ownership
    const link = await LinkInfo.findOne({
      _id: linkId,
      userId: req.user.userId,
    });

    if (!link) {
      return res.status(404).json({ message: "Link not found" });
    }

    // Get visit statistics grouped by country
    const stats = await VisitInfo.aggregate([
      { $match: { linkId: mongoose.Types.ObjectId(linkId) } },
      {
        $group: {
          _id: "$country",
          visits: { $sum: 1 },
          lastVisit: { $max: "$timestamp" },
        },
      },
      { $sort: { visits: -1 } },
    ]);

    res.json({
      totalVisits: stats.reduce((sum, stat) => sum + stat.visits, 0),
      countryStats: stats.map((stat) => ({
        country: stat._id,
        visits: stat.visits,
        lastVisit: stat.lastVisit,
      })),
    });
  } catch (error) {
    console.error("Error getting stats:", error);
    res.status(500).json({ message: "Error fetching statistics" });
  }
});

// Regenerate link with same features
app.put("/api/linkInfo/:id", auth, async (req, res) => {
  try {
    const linkId = req.params.id;
    const { subdomain, url } = req.body;

    // Find original link and verify ownership
    const originalLink = await LinkInfo.findOne({
      _id: linkId,
      userId: req.user.userId,
    });

    if (!originalLink) {
      return res.status(404).json({ message: "Link not found" });
    }

    // Check if new subdomain already exists
    const existingLink = await LinkInfo.findOne({ subdomain });
    if (existingLink && existingLink._id.toString() !== linkId) {
      return res.status(400).json({ message: "Subdomain already exists" });
    }

    // Create new link with same features
    const updatedLink = await LinkInfo.findByIdAndUpdate(
      linkId,
      {
        $set: {
          subdomain: subdomain,
          url: url,
          originalUrl: originalLink.originalUrl,
          features: originalLink.features, // Giữ nguyên các features từ link gốc
          updatedAt: new Date(),
        },
      },
      { new: true }
    );

    res.json({
      message: "Link regenerated successfully",
      link: updatedLink,
    });
  } catch (error) {
    console.error("Error regenerating link:", error);
    res
      .status(500)
      .json({ message: "Error regenerating link", error: error.message });
  }
});

// Catch-all route for serving the React app
// This MUST be AFTER all other API and specific routes
app.get("*", (req, res) => {
  res.sendFile(
    path.join(__dirname, "../frontend/customerweb/build", "index.html")
  );
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
