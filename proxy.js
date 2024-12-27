const express = require("express");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { google } = require("googleapis");
const NodeCache = require("node-cache");
const FileStore = require("session-file-store")(session);
const crypto = require("crypto");
const cors = require("cors");

const app = express();

// Khởi tạo cache
const fileCache = new NodeCache({
  stdTTL: 3600,
  checkperiod: 600,
});

// Map để theo dõi streams đang hoạt động
const activeStreams = new Map();

// Trust proxy
app.set("trust proxy", 1);

// CORS config
app.use(
  cors({
    origin: ["https://khoahoc.live"],
    credentials: true,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "X-API-Key"],
  })
);

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Cấu hình Session
app.use(
  session({
    store: new FileStore({
      path: "./sessions",
      ttl: 86400,
    }),
    secret: "X9k#mP2$vL5nQ8*jR3wH7@yT4cF6!bN9",
    resave: true,
    saveUninitialized: true,
    proxy: true,
    name: "khoahoc.sid",
    cookie: {
      secure: true,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: "none",
      domain: "khoahoc.live",
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

// Thêm middleware để log session
app.use((req, res, next) => {
  console.log("[Session Debug]", {
    sessionID: req.sessionID,
    session: req.session,
    isAuthenticated: req.isAuthenticated?.(),
    user: req.user,
  });
  next();
});

// Cấu hình Google OAuth2
const GOOGLE_CLIENT_ID =
  "861555630148-b15tbuo5m5cf8utp7lt7iunidm0bvb8h.apps.googleusercontent.com";
const GOOGLE_CLIENT_SECRET = "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";
const CALLBACK_URL = "https://khoahoc.live/auth/google/callback";

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  CALLBACK_URL
);

passport.use(
  new GoogleStrategy(
    {
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log("[OAuth] Login attempt:", {
          userId: profile.id,
          email: profile.emails[0].value,
        });

        const user = {
          id: profile.id,
          email: profile.emails[0].value,
          accessToken: accessToken,
          refreshToken: refreshToken,
        };

        oauth2Client.setCredentials({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        console.log("[OAuth] Credentials set successfully");
        return done(null, user);
      } catch (error) {
        console.error("[OAuth] Error:", error);
        return done(error, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  console.log("[Session] Serializing user:", user.id);
  done(null, user);
});

passport.deserializeUser((user, done) => {
  console.log("[Session] Deserializing user:", user.id);
  done(null, user);
});

function isLoggedIn(req, res, next) {
  console.log("[Auth] Checking authentication:", {
    isAuthenticated: req.isAuthenticated(),
    user: req.user?.id,
    session: req.session,
  });
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/");
}

// Thêm key để mã hóa
const ENCRYPTION_KEY = "X9k#mP2$vL5nQ8*jR3wH7@yT4cF6!bN9"; // 32 bytes
const IV_LENGTH = 16;

// Hàm mã hóa fileId
function encryptFileId(fileId) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(ENCRYPTION_KEY),
    iv
  );
  let encrypted = cipher.update(fileId);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

// Hàm giải mã fileId
function decryptFileId(encrypted) {
  const parts = encrypted.split(":");
  const iv = Buffer.from(parts[0], "hex");
  const encryptedText = Buffer.from(parts[1], "hex");
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(ENCRYPTION_KEY),
    iv
  );
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

// Route proxy với stream management
app.get("/proxy/:encryptedFileId", isLoggedIn, async (req, res) => {
  const streamId = req.sessionID + "_" + req.params.encryptedFileId;

  try {
    // Kiểm tra và đóng stream cũ nếu có
    if (activeStreams.has(streamId)) {
      console.log("[Proxy] Closing existing stream:", streamId);
      const oldStream = activeStreams.get(streamId);
      oldStream.destroy();
      activeStreams.delete(streamId);
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Đợi 1s để stream cũ đóng hoàn toàn
    }

    const fileId = decryptFileId(req.params.encryptedFileId);
    console.log("[Proxy] Accessing file:", fileId);

    // Set credentials và refresh token nếu cần
    if (!oauth2Client.credentials || !oauth2Client.credentials.access_token) {
      oauth2Client.setCredentials({
        access_token: req.user.accessToken,
        refresh_token: req.user.refreshToken,
      });
    }

    const drive = google.drive({ version: "v3", auth: oauth2Client });

    // Lấy thông tin file
    const fileInfo = await drive.files.get({
      fileId: fileId,
      fields: "id, name, mimeType, size",
    });

    // Stream file với retry logic
    let retryCount = 0;
    const maxRetries = 3;

    const streamFile = async () => {
      try {
        const response = await drive.files.get(
          { fileId: fileId, alt: "media" },
          { responseType: "stream" }
        );

        // Set headers
        res.setHeader("Content-Type", fileInfo.data.mimeType);
        res.setHeader(
          "Content-Disposition",
          `inline; filename="${encodeURIComponent(fileInfo.data.name)}"`
        );

        // Lưu stream vào Map
        activeStreams.set(streamId, response.data);

        // Xử lý events với error handling tốt hơn
        response.data
          .on("end", () => {
            console.log("[Proxy] Stream ended successfully:", streamId);
            activeStreams.delete(streamId);
          })
          .on("error", async (error) => {
            console.error("[Proxy] Stream error:", error);
            if (retryCount < maxRetries && !res.headersSent) {
              retryCount++;
              console.log(`[Proxy] Retrying (${retryCount}/${maxRetries})...`);
              await streamFile();
            } else {
              activeStreams.delete(streamId);
              if (!res.headersSent) {
                res.status(500).send("Error streaming file");
              }
            }
          })
          .pipe(res)
          .on("error", (error) => {
            console.error("[Proxy] Pipe error:", error);
          });

        // Cleanup khi client disconnect
        req.on("close", () => {
          if (activeStreams.has(streamId)) {
            console.log("[Proxy] Client disconnected, cleaning up:", streamId);
            const stream = activeStreams.get(streamId);
            stream.destroy();
            activeStreams.delete(streamId);
          }
        });
      } catch (error) {
        throw error;
      }
    };

    await streamFile();
  } catch (error) {
    console.error("[Proxy] Error:", error);
    activeStreams.delete(streamId);
    if (!res.headersSent) {
      res.status(500).send("Error accessing file");
    }
  }
});

// Cleanup định kỳ cho streams
setInterval(() => {
  console.log("[Cleanup] Active streams:", activeStreams.size);
  for (const [streamId, stream] of activeStreams.entries()) {
    if (!stream.readable) {
      console.log("[Cleanup] Removing dead stream:", streamId);
      stream.destroy();
      activeStreams.delete(streamId);
    }
  }
}, 60000);

// Routes
app.get("/", (req, res) => {
  console.log("[Route] Home page accessed, Session:", req.session);
  if (req.isAuthenticated()) {
    res.redirect("/dashboard");
  } else {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
          <title>Google Drive Proxy</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
              body {
                  font-family: Arial, sans-serif;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  margin: 0;
                  background-color: #f5f5f5;
              }
              .login-container {
                  background: white;
                  padding: 20px;
                  border-radius: 8px;
                  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                  text-align: center;
              }
              .login-button {
                  background-color: #4285f4;
                  color: white;
                  padding: 10px 20px;
                  border: none;
                  border-radius: 4px;
                  cursor: pointer;
                  text-decoration: none;
                  display: inline-block;
                  margin-top: 10px;
              }
          </style>
      </head>
      <body>
          <div class="login-container">
              <h2>Google Drive Proxy</h2>
              <a href="/auth/google" class="login-button">Đăng nhập với Google</a>
          </div>
      </body>
      </html>
    `);
  }
});

app.get(
  "/auth/google",
  (req, res, next) => {
    console.log("[Route] Starting Google auth");
    next();
  },
  passport.authenticate("google", {
    scope: [
      "profile",
      "email",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
    prompt: "consent",
  })
);

app.get(
  "/auth/google/callback",
  (req, res, next) => {
    console.log("[Route] Received callback from Google");
    next();
  },
  passport.authenticate("google", {
    failureRedirect: "/",
    successRedirect: "/dashboard",
    failureFlash: true,
  })
);

// Dashboard route
app.get("/dashboard", isLoggedIn, async (req, res) => {
  try {
    console.log("[Dashboard] Accessing with user:", req.user.email);

    oauth2Client.setCredentials({
      access_token: req.user.accessToken,
      refresh_token: req.user.refreshToken,
    });

    const drive = google.drive({ version: "v3", auth: oauth2Client });

    const response = await drive.files.list({
      pageSize: 50,
      fields: "files(id, name, mimeType, size, modifiedTime)",
      orderBy: "modifiedTime desc",
    });

    console.log("[Dashboard] Files fetched:", response.data.files.length);

    const files = response.data.files.map((file) => ({
      ...file,
      encryptedId: encryptFileId(file.id),
    }));

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
          <title>Dashboard - Google Drive Proxy</title>
          <meta charset="UTF-8">
          <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              .header { display: flex; justify-content: space-between; align-items: center; }
              .file-list { margin-top: 20px; }
              .file-item { 
                  padding: 10px;
                  border: 1px solid #ddd;
                  margin-bottom: 10px;
                  border-radius: 4px;
              }
              .logout-button {
                  background-color: #dc3545;
                  color: white;
                  padding: 8px 16px;
                  border-radius: 4px;
                  text-decoration: none;
              }
          </style>
      </head>
      <body>
          <div class="header">
              <h2>Welcome ${req.user.email}</h2>
              <a href="/logout" class="logout-button">Đăng xuất</a>
          </div>
          <div class="file-list">
              <h3>Your Files:</h3>
              ${files
                .map(
                  (file) => `
                  <div class="file-item">
                      <strong>${file.name}</strong><br>
                      <span class="file-size">
                          Type: ${file.mimeType}<br>
                          Modified: ${new Date(
                            file.modifiedTime
                          ).toLocaleString()}<br>
                          Size: ${
                            file.size
                              ? Math.round(file.size / 1024) + " KB"
                              : "N/A"
                          }
                      </span><br>
                      <a href="/proxy/${
                        file.encryptedId
                      }" class="proxy-link" target="_blank">
                          View File
                      </a>
                  </div>
              `
                )
                .join("")}
          </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error("[Dashboard] Error:", error);
    res.status(500).send("Error loading dashboard");
  }
});

// Route đăng xuất
app.get("/logout", (req, res) => {
  console.log("[Auth] User logging out");
  req.logout(function (err) {
    if (err) {
      console.error("[Auth] Logout error:", err);
      return next(err);
    }
    res.redirect("/");
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error("[Error]", {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
  });
  res.status(500).send("Internal Server Error");
});

// Khởi động server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});