import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, X, XCircle, Info, AppWindow } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";

export default function AppsTab({ processes, loading, onRefresh }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("memory_mb");
  const [sortOrder, setSortOrder] = useState("desc");
  const [selectedProcess, setSelectedProcess] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [processDetails, setProcessDetails] = useState(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Filter for user-level applications only (exclude system processes and services)
  // Apps typically have a window and are not running as SYSTEM or background services
  const userApps = useMemo(() => {
    return processes.filter((proc) => {
      // Filter out system processes
      if (proc.protected) return false;
      if (proc.username === "SYSTEM" || proc.username === "N/A") return false;

      // Common system/service process patterns to exclude
      const systemPatterns = [
        "svchost.exe",
        "service host",
        "runtime broker",
        "desktop window manager",
        "windows",
        "conhost.exe",
        "csrss.exe",
        "lsass.exe",
        "smss.exe",
        "services.exe",
        "wininit.exe",
        "winlogon.exe",
        "fontdrvhost.exe",
        "dwm.exe",
        "sihost.exe",
        "taskhostw.exe",
        "searchindexer",
        "searchhost",
        "startmenuexperiencehost",
        "shellexperiencehost",
        "runtimebroker",
        "applicationframehost",
        "textinputhost",
        "securityhealthservice",
        "widgets.exe",
        "msedgewebview2",
      ];

      const procNameLower = proc.name.toLowerCase();
      return !systemPatterns.some((pattern) =>
        procNameLower.includes(pattern.toLowerCase())
      );
    });
  }, [processes]);

  // Group processes by app name and aggregate their resources
  const groupedApps = useMemo(() => {
    const appGroups = {};

    userApps.forEach((proc) => {
      const appName = proc.name;

      if (!appGroups[appName]) {
        appGroups[appName] = {
          name: appName,
          pids: [],
          processes: [],
          cpu_percent: 0,
          memory_mb: 0,
          threads: 0,
          username: proc.username,
          status: proc.status,
          protected: proc.protected,
        };
      }

      appGroups[appName].pids.push(proc.pid);
      appGroups[appName].processes.push(proc);
      appGroups[appName].cpu_percent += proc.cpu_percent;
      appGroups[appName].memory_mb += proc.memory_mb;
      appGroups[appName].threads += proc.threads;
    });

    // Convert to array and round values
    return Object.values(appGroups).map((app) => ({
      ...app,
      cpu_percent: Math.round(app.cpu_percent * 10) / 10,
      memory_mb: Math.round(app.memory_mb * 10) / 10,
      process_count: app.processes.length,
    }));
  }, [userApps]);

  // Filter and sort grouped apps
  const filteredApps = useMemo(
    () =>
      groupedApps
        .filter(
          (app) =>
            app.name
              .toLowerCase()
              .includes(debouncedSearchTerm.toLowerCase()) ||
            app.pids.some((pid) => pid.toString().includes(debouncedSearchTerm))
        )
        .sort((a, b) => {
          const aVal = a[sortBy];
          const bVal = b[sortBy];

          // Use string comparison for text fields
          if (
            sortBy === "name" ||
            sortBy === "status" ||
            sortBy === "username"
          ) {
            const comparison = String(aVal || "").localeCompare(
              String(bVal || ""),
              undefined,
              { sensitivity: "base" }
            );
            return sortOrder === "asc" ? comparison : -comparison;
          }

          // Use numeric comparison for numeric fields
          return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
        }),
    [groupedApps, debouncedSearchTerm, sortBy, sortOrder]
  );

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("desc");
    }
  };

  const handleEndTask = async (pid, processName) => {
    if (!confirm(`Are you sure you want to end "${processName}"?`)) return;

    const loadingToast = toast.loading("Ending task...");

    try {
      const response = await axios.post(
        `/api/process/${pid}/kill`,
        {},
        {
          timeout: 8000,
        }
      );

      const msg =
        response.data.message || `Task ${processName} ended successfully`;
      toast.success(msg, {
        id: loadingToast,
        duration: response.data.confirmed === false ? 5000 : 3000,
      });

      setTimeout(onRefresh, 500);
    } catch (error) {
      if (error.code === "ECONNABORTED") {
        toast.error(`Task termination timed out`, {
          id: loadingToast,
          duration: 5000,
        });
      } else {
        toast.error(error.response?.data?.detail || "Failed to end task", {
          id: loadingToast,
        });
      }
    }
  };

  const handleEndAllAppProcesses = async (pids, appName) => {
    if (
      !confirm(
        `End all ${pids.length} ${
          pids.length === 1 ? "process" : "processes"
        } of ${appName}?`
      )
    )
      return;

    const loadingToast = toast.loading(`Ending ${appName}...`);

    try {
      // Kill all processes in parallel for faster termination
      const results = await Promise.allSettled(
        pids.map((pid) =>
          axios.post(`/api/process/${pid}/kill`, {}, { timeout: 3000 })
        )
      );

      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;

      if (succeeded > 0) {
        toast.success(
          `${appName}: ${succeeded} process${succeeded > 1 ? "es" : ""} ended${
            failed > 0 ? `, ${failed} failed` : ""
          }`,
          { id: loadingToast, duration: 4000 }
        );
      } else {
        toast.error(`Failed to end ${appName}`, { id: loadingToast });
      }

      setTimeout(onRefresh, 300);
    } catch (error) {
      toast.error(`Failed to end ${appName}`, { id: loadingToast });
    }
  };

  const showProcessDetails = async (pid) => {
    try {
      const response = await axios.get(`/api/process/${pid}`, {
        timeout: 2000,
      });
      setProcessDetails(response.data);
      setShowModal(true);
    } catch (error) {
      toast.error("Failed to fetch process details");
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case "running":
        return "text-green-400";
      case "sleeping":
        return "text-blue-400";
      case "stopped":
        return "text-red-400";
      case "zombie":
        return "text-red-600";
      case "dead":
        return "text-red-700";
      case "disk-sleep":
        return "text-blue-500";
      case "idle":
        return "text-gray-500";
      case "locked":
        return "text-yellow-600";
      case "parked":
        return "text-purple-400";
      case "tracing-stop":
        return "text-orange-400";
      case "waiting":
        return "text-cyan-400";
      case "waking":
        return "text-teal-400";
      default:
        return "text-gray-400";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <AppWindow className="w-7 h-7" />
            Apps
          </h2>
          <p className="text-gray-400 mt-1">
            User applications and programs currently running
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onRefresh}
          className="px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/80 transition-colors"
        >
          Refresh
        </motion.button>
      </div>

      {/* Search and Stats */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1 max-w-md relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search apps..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-10 py-2 bg-dark-elevated border border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary text-white placeholder-gray-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          <div className="flex items-center space-x-4 text-sm">
            <span className="text-gray-400">
              Apps running:{" "}
              <span className="text-white font-semibold">
                {groupedApps.length}
              </span>
            </span>
            <span className="text-gray-400">
              Filtered:{" "}
              <span className="text-white font-semibold">
                {filteredApps.length}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Apps Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-dark-elevated/50">
              <tr>
                <th
                  onClick={() => handleSort("name")}
                  className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                >
                  Name {sortBy === "name" && (sortOrder === "asc" ? "↑" : "↓")}
                </th>
                <th
                  onClick={() => handleSort("cpu_percent")}
                  className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                >
                  CPU %{" "}
                  {sortBy === "cpu_percent" &&
                    (sortOrder === "asc" ? "↑" : "↓")}
                </th>
                <th
                  onClick={() => handleSort("memory_mb")}
                  className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                >
                  Memory{" "}
                  {sortBy === "memory_mb" && (sortOrder === "asc" ? "↑" : "↓")}
                </th>
                <th
                  onClick={() => handleSort("status")}
                  className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                >
                  Status{" "}
                  {sortBy === "status" && (sortOrder === "asc" ? "↑" : "↓")}
                </th>
                <th className="px-6 py-4 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-border">
              {loading ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-primary"></div>
                      <span className="ml-3 text-gray-400">
                        Loading apps...
                      </span>
                    </div>
                  </td>
                </tr>
              ) : filteredApps.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center">
                    <AppWindow className="w-12 h-12 mx-auto text-gray-600 mb-3" />
                    <p className="text-gray-400">No apps found</p>
                  </td>
                </tr>
              ) : (
                filteredApps.map((app, index) => (
                  <motion.tr
                    key={app.name}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.01 }}
                    className="hover:bg-dark-elevated/30 transition-colors cursor-pointer"
                    onClick={() => setSelectedProcess(app)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-white flex items-center">
                        <AppWindow className="w-4 h-4 mr-2 text-blue-400" />
                        {app.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {app.process_count}{" "}
                        {app.process_count === 1 ? "process" : "processes"} •{" "}
                        {app.username}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-16 bg-dark-border rounded-full h-2 mr-2">
                          <div
                            className="bg-gradient-to-r from-accent-primary to-accent-secondary h-2 rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.min(app.cpu_percent, 100)}%`,
                            }}
                          />
                        </div>
                        <span className="text-sm text-white">
                          {app.cpu_percent}%
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {app.memory_mb} MB
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`text-sm font-medium ${getStatusColor(
                          app.status
                        )}`}
                      >
                        {app.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm space-x-2">
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          showProcessDetails(app.pids[0]);
                        }}
                        className="inline-flex items-center p-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors"
                        title="Details"
                      >
                        <Info className="w-4 h-4" />
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEndAllAppProcesses(app.pids, app.name);
                        }}
                        className="inline-flex items-center p-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
                        title="End Task"
                      >
                        <XCircle className="w-4 h-4" />
                      </motion.button>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Process Details Modal */}
      {showModal && processDetails && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowModal(false)}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="glass-card max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">App Details</h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-gray-400 text-sm">Name</p>
                    <p className="text-white font-medium">
                      {processDetails.name}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm">Process Count</p>
                    <p className="text-white font-medium">
                      {groupedApps[processDetails.name]?.pids.length || 1}{" "}
                      {groupedApps[processDetails.name]?.pids.length > 1
                        ? "processes"
                        : "process"}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm">Status</p>
                    <p
                      className={`font-medium ${getStatusColor(
                        processDetails.status
                      )}`}
                    >
                      {processDetails.status}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm">User</p>
                    <p className="text-white font-medium">
                      {processDetails.username}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm">Total CPU Usage</p>
                    <p className="text-white font-medium">
                      {processDetails.cpu_percent}%
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm">Total Memory</p>
                    <p className="text-white font-medium">
                      {processDetails.memory_mb} MB
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm">Total Threads</p>
                    <p className="text-white font-medium">
                      {processDetails.num_threads}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm">PIDs</p>
                    <p className="text-white font-medium font-mono text-xs">
                      {groupedApps[processDetails.name]?.pids.join(", ") ||
                        processDetails.pid}
                    </p>
                  </div>
                </div>

                {processDetails.exe && (
                  <div>
                    <p className="text-gray-400 text-sm mb-1">
                      Executable Path
                    </p>
                    <p className="text-white font-mono text-xs bg-dark-elevated p-2 rounded break-all">
                      {processDetails.exe}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
