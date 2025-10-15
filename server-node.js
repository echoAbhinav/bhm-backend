const express = require("express");
const cors = require("cors");
const fs = require("fs").promises;
const path = require("path");

const app = express();
const PORT = 8080;
const HISTORY_FILE = path.join(__dirname, "history.json");

// Middleware
app.use(
  cors({
    origin: "http://localhost:5174", // Allow only requests from this origin
    methods: ["GET", "POST"], // Allow only specific HTTP methods
  })
);

app.use(express.json());
app.use(express.static("public"));

// In-memory storage
let browserHistory = {
  pages: [],
  currentIndex: -1,
};

// Initialize history from file
async function initializeHistory() {
  try {
    const data = await fs.readFile(HISTORY_FILE, "utf8");
    browserHistory = JSON.parse(data);
    console.log("✅ History loaded from file");
  } catch (error) {
    console.log("📝 No existing history file, starting fresh");
    await saveHistory();
  }
}

// Save history to file
async function saveHistory() {
  try {
    await fs.writeFile(HISTORY_FILE, JSON.stringify(browserHistory, null, 2));
  } catch (error) {
    console.error("❌ Failed to save history:", error.message);
  }
}

// Helper function to validate URL
function isValidUrl(string) {
  try {
    new URL(string.startsWith("http") ? string : `https://${string}`);
    return true;
  } catch {
    return false;
  }
}

// Routes

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Backend server is running",
    timestamp: new Date().toISOString(),
    historyCount: browserHistory.pages.length,
  });
});

// Get current page and navigation state
app.get("/api/current", (req, res) => {
  const currentPage =
    browserHistory.currentIndex >= 0 &&
    browserHistory.currentIndex < browserHistory.pages.length
      ? browserHistory.pages[browserHistory.currentIndex]
      : null;

  res.json({
    success: true,
    data: {
      page: currentPage ? currentPage.url : "",
      canGoBack: browserHistory.currentIndex > 0,
      canGoForward:
        browserHistory.currentIndex < browserHistory.pages.length - 1,
      currentIndex: browserHistory.currentIndex,
      totalPages: browserHistory.pages.length,
    },
  });
});

// Get complete history
app.get("/api/history", (req, res) => {
  const historyWithIndex = browserHistory.pages.map((page, index) => ({
    ...page,
    index: index + 1,
    isCurrent: index === browserHistory.currentIndex,
  }));

  res.json({
    success: true,
    data: {
      history: historyWithIndex,
      currentIndex: browserHistory.currentIndex,
      totalPages: browserHistory.pages.length,
    },
  });
});

// Visit a new page
app.post("/api/visit", async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== "string") {
      return res.status(400).json({
        success: false,
        error: "URL is required and must be a string",
      });
    }

    const trimmedUrl = url.trim();
    if (!isValidUrl(trimmedUrl)) {
      return res.status(400).json({
        success: false,
        error: "Invalid URL format",
      });
    }

    // Normalize URL
    let normalizedUrl = trimmedUrl;
    if (
      !normalizedUrl.startsWith("http://") &&
      !normalizedUrl.startsWith("https://")
    ) {
      normalizedUrl = "https://" + normalizedUrl;
    }

    // Create new page entry
    const newPage = {
      url: normalizedUrl,
      timestamp: new Date().toISOString(),
      title: getDomainFromUrl(normalizedUrl),
    };

    // Remove any pages after current index (if we're not at the end)
    if (browserHistory.currentIndex < browserHistory.pages.length - 1) {
      browserHistory.pages = browserHistory.pages.slice(
        0,
        browserHistory.currentIndex + 1
      );
    }

    // Add new page
    browserHistory.pages.push(newPage);
    browserHistory.currentIndex = browserHistory.pages.length - 1;

    await saveHistory();

    res.json({
      success: true,
      data: {
        page: normalizedUrl,
        canGoBack: browserHistory.currentIndex > 0,
        canGoForward: false, // Always false after visiting a new page
        currentIndex: browserHistory.currentIndex,
        totalPages: browserHistory.pages.length,
      },
      message: `Successfully visited: ${normalizedUrl}`,
    });
  } catch (error) {
    console.error("❌ Error visiting page:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error while visiting page",
    });
  }
});

// Go back in history
app.post("/api/back", async (req, res) => {
  try {
    if (browserHistory.currentIndex <= 0) {
      return res.status(400).json({
        success: false,
        error: "Cannot go back - already at the beginning of history",
      });
    }

    browserHistory.currentIndex--;
    await saveHistory();

    const currentPage = browserHistory.pages[browserHistory.currentIndex];

    res.json({
      success: true,
      data: {
        page: currentPage.url,
        canGoBack: browserHistory.currentIndex > 0,
        canGoForward:
          browserHistory.currentIndex < browserHistory.pages.length - 1,
        currentIndex: browserHistory.currentIndex,
        totalPages: browserHistory.pages.length,
      },
      message: `Went back to: ${currentPage.url}`,
    });
  } catch (error) {
    console.error("❌ Error going back:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error while going back",
    });
  }
});

// Go forward in history
app.post("/api/forward", async (req, res) => {
  try {
    if (browserHistory.currentIndex >= browserHistory.pages.length - 1) {
      return res.status(400).json({
        success: false,
        error: "Cannot go forward - already at the end of history",
      });
    }

    browserHistory.currentIndex++;
    await saveHistory();

    const currentPage = browserHistory.pages[browserHistory.currentIndex];

    res.json({
      success: true,
      data: {
        page: currentPage.url,
        canGoBack: browserHistory.currentIndex > 0,
        canGoForward:
          browserHistory.currentIndex < browserHistory.pages.length - 1,
        currentIndex: browserHistory.currentIndex,
        totalPages: browserHistory.pages.length,
      },
      message: `Went forward to: ${currentPage.url}`,
    });
  } catch (error) {
    console.error("❌ Error going forward:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error while going forward",
    });
  }
});

// Clear all history
app.delete("/api/clear", async (req, res) => {
  try {
    browserHistory = {
      pages: [],
      currentIndex: -1,
    };

    await saveHistory();

    res.json({
      success: true,
      data: {
        page: "",
        canGoBack: false,
        canGoForward: false,
        currentIndex: -1,
        totalPages: 0,
      },
      message: "History cleared successfully",
    });
  } catch (error) {
    console.error("❌ Error clearing history:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error while clearing history",
    });
  }
});

// Helper function to extract domain from URL
function getDomainFromUrl(url) {
  try {
    const urlObj = new URL(url.startsWith("http") ? url : `https://${url}`);
    return urlObj.hostname;
  } catch {
    return url.split("/")[0];
  }
}

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("❌ Unhandled error:", error);
  res.status(500).json({
    success: false,
    error: "Internal server error",
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
  });
});

// Start server
async function startServer() {
  try {
    await initializeHistory();

    app.listen(PORT, () => {
      console.log(`
🚀 Browser History Manager Backend Server
┌─────────────────────────────────────────┐
│  Server running on http://localhost:${PORT}  │
│  API endpoints:                         │
│  • GET  /api/health                     │
│  • GET  /api/current                    │
│  • GET  /api/history                    │
│  • POST /api/visit                      │
│  • POST /api/back                       │
│  • POST /api/forward                    │
│  • DELETE /api/clear                    │
└─────────────────────────────────────────┘
📊 History: ${browserHistory.pages.length} pages
📍 Current: ${
        browserHistory.currentIndex >= 0
          ? browserHistory.pages[browserHistory.currentIndex]?.url || "None"
          : "None"
      }
`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down server...");
  await saveHistory();
  console.log("💾 History saved successfully");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n🛑 Shutting down server...");
  await saveHistory();
  console.log("💾 History saved successfully");
  process.exit(0);
});

startServer();
