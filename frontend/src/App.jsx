import { useState, useEffect, useRef } from "react";
import { Toaster } from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import ProcessList from "./components/ProcessList";
import PerformanceTab from "./components/PerformanceTab";
import ProcessTree from "./components/ProcessTree";
import AppsTab from "./components/AppsTab";
import axios from "axios";
import { API_BASE_URL, POLL_INTERVAL_MS, WS_BASE_URL } from "./constants";

// Configure axios
axios.defaults.baseURL = API_BASE_URL;

function App() {
  const [currentTab, setCurrentTab] = useState("dashboard");
  const [systemStats, setSystemStats] = useState(null);
  const [processes, setProcesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [useWebSocket, setUseWebSocket] = useState(true);
  const wsStatsRef = useRef(null);
  const wsProcessesRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  // Fetch system stats (fallback for polling mode)
  const fetchSystemStats = async () => {
    try {
      const response = await axios.get("/api/system/stats");
      setSystemStats(response.data);
      setIsOnline(true);
      setRetryCount(0);
    } catch (error) {
      console.error("Error fetching system stats:", error);
      setIsOnline(false);
    }
  };

  // Fetch processes (fallback for polling mode)
  const fetchProcesses = async () => {
    try {
      const response = await axios.get("/api/processes");
      setProcesses(response.data.processes);
      setLoading(false);
      setIsOnline(true);
      setRetryCount(0);
    } catch (error) {
      console.error("Error fetching processes:", error);
      setLoading(false);
      setIsOnline(false);
    }
  };

  // WebSocket connection for system stats
  const connectStatsWebSocket = () => {
    if (wsStatsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${WS_BASE_URL}/ws/system-stats`);

    ws.onopen = () => {
      console.log("✅ System stats WebSocket connected");
      setIsOnline(true);
      setRetryCount(0);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setSystemStats(data);
        setLoading(false);
      } catch (error) {
        console.error("Error parsing stats data:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("Stats WebSocket error:", error);
    };

    ws.onclose = () => {
      console.log("Stats WebSocket closed, falling back to polling...");
      setIsOnline(false);
      setUseWebSocket(false);
      wsStatsRef.current = null;

      // Attempt reconnect after delay
      if (reconnectTimeoutRef.current)
        clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        if (retryCount < 3) {
          setRetryCount((prev) => prev + 1);
          connectStatsWebSocket();
        }
      }, 5000);
    };

    wsStatsRef.current = ws;
  };

  // WebSocket connection for processes
  const connectProcessesWebSocket = () => {
    if (wsProcessesRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${WS_BASE_URL}/ws/processes`);

    ws.onopen = () => {
      console.log("✅ Processes WebSocket connected");
      setIsOnline(true);
      setRetryCount(0);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setProcesses(data.processes);
        setLoading(false);
      } catch (error) {
        console.error("Error parsing processes data:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("Processes WebSocket error:", error);
    };

    ws.onclose = () => {
      console.log("Processes WebSocket closed, falling back to polling...");
      setIsOnline(false);
      setUseWebSocket(false);
      wsProcessesRef.current = null;

      // Attempt reconnect after delay
      if (reconnectTimeoutRef.current)
        clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        if (retryCount < 3) {
          setRetryCount((prev) => prev + 1);
          connectProcessesWebSocket();
        }
      }, 5000);
    };

    wsProcessesRef.current = ws;
  };

  // Main data fetching effect
  useEffect(() => {
    if (useWebSocket) {
      // Try WebSocket first
      connectStatsWebSocket();
      connectProcessesWebSocket();
    } else {
      // Fallback to polling
      fetchSystemStats();
      fetchProcesses();

      const interval = setInterval(() => {
        if (document.visibilityState === "visible") {
          fetchSystemStats();
          fetchProcesses();
        }
      }, POLL_INTERVAL_MS);

      return () => clearInterval(interval);
    }

    // Cleanup WebSockets
    return () => {
      if (wsStatsRef.current) {
        wsStatsRef.current.close();
        wsStatsRef.current = null;
      }
      if (wsProcessesRef.current) {
        wsProcessesRef.current.close();
        wsProcessesRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [useWebSocket]);

  // Periodically attempt to restore WebSocket when in polling mode
  useEffect(() => {
    if (useWebSocket) return;

    const attempt = () => {
      try {
        const testStats = new WebSocket(`${WS_BASE_URL}/ws/system-stats`);
        testStats.onopen = () => {
          try {
            testStats.close();
          } catch {}
          setUseWebSocket(true);
        };
        testStats.onerror = () => {
          try {
            testStats.close();
          } catch {}
        };

        const testProcs = new WebSocket(`${WS_BASE_URL}/ws/processes`);
        testProcs.onopen = () => {
          try {
            testProcs.close();
          } catch {}
          setUseWebSocket(true);
        };
        testProcs.onerror = () => {
          try {
            testProcs.close();
          } catch {}
        };
      } catch {}
    };

    // Try now and every 30s while polling
    attempt();
    const id = setInterval(attempt, 30000);
    return () => clearInterval(id);
  }, [useWebSocket]);

  // Handle visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && !useWebSocket) {
        // Refresh immediately when tab becomes visible (polling mode)
        fetchSystemStats();
        fetchProcesses();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [useWebSocket]);

  // Retry connection when offline
  useEffect(() => {
    if (!isOnline && !useWebSocket && retryCount < 5) {
      const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 10000);
      const retryTimer = setTimeout(() => {
        setRetryCount(retryCount + 1);
        fetchSystemStats();
        fetchProcesses();
      }, retryDelay);

      return () => clearTimeout(retryTimer);
    }
  }, [isOnline, retryCount, useWebSocket]);

  return (
    <div className="flex h-screen overflow-hidden bg-dark-bg">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "#1a1a24",
            color: "#fff",
            border: "1px solid #2a2a3a",
          },
          success: {
            iconTheme: {
              primary: "#10b981",
              secondary: "#fff",
            },
          },
          error: {
            iconTheme: {
              primary: "#ef4444",
              secondary: "#fff",
            },
          },
        }}
      />

      {/* Offline Banner */}
      {!isOnline && (
        <motion.div
          initial={{ y: -100 }}
          animate={{ y: 0 }}
          className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white px-4 py-3 text-center shadow-lg"
        >
          <div className="flex items-center justify-center gap-2">
            <svg
              className="w-5 h-5 animate-pulse"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span>
              Backend connection lost. Retrying... (Attempt {retryCount + 1}/5)
            </span>
          </div>
        </motion.div>
      )}

      {/* Sidebar */}
      <Sidebar currentTab={currentTab} setCurrentTab={setCurrentTab} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <Header systemStats={systemStats} />

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              {currentTab === "dashboard" && (
                <Dashboard
                  systemStats={systemStats}
                  processes={processes}
                  loading={loading}
                />
              )}
              {currentTab === "performance" && (
                <PerformanceTab systemStats={systemStats} />
              )}
              {currentTab === "apps" && (
                <AppsTab
                  processes={processes}
                  loading={loading}
                  onRefresh={fetchProcesses}
                />
              )}
              {currentTab === "processes" && (
                <ProcessList
                  processes={processes}
                  loading={loading}
                  onRefresh={fetchProcesses}
                />
              )}
              {currentTab === "processtree" && (
                <ProcessTree processes={processes} />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

export default App;
