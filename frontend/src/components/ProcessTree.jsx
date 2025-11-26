import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { ChevronDown, ChevronRight, Shield, Zap } from "lucide-react";

export default function ProcessTree({ processes }) {
  const [expandedNodes, setExpandedNodes] = useState(new Set());

  // Build process tree structure
  const processTree = useMemo(() => {
    const processMap = new Map();
    const rootProcesses = [];

    // Create a map of all processes
    processes.forEach((proc) => {
      processMap.set(proc.pid, { ...proc, children: [] });
    });

    // Build parent-child relationships
    processes.forEach((proc) => {
      const processNode = processMap.get(proc.pid);
      if (proc.ppid && processMap.has(proc.ppid)) {
        const parent = processMap.get(proc.ppid);
        parent.children.push(processNode);
      } else {
        // Root process (no parent or parent not in list)
        rootProcesses.push(processNode);
      }
    });

    return rootProcesses;
  }, [processes]);

  const toggleNode = (pid) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(pid)) {
      newExpanded.delete(pid);
    } else {
      newExpanded.add(pid);
    }
    setExpandedNodes(newExpanded);
  };

  const ProcessNode = ({ process, depth = 0 }) => {
    const isExpanded = expandedNodes.has(process.pid);
    const hasChildren = process.children && process.children.length > 0;

    return (
      <div>
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center hover:bg-dark-elevated/30 transition-colors py-2 px-4 cursor-pointer"
          style={{ paddingLeft: `${depth * 24 + 16}px` }}
        >
          {/* Expand/Collapse Button */}
          <div className="w-6 h-6 flex items-center justify-center mr-2">
            {hasChildren ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleNode(process.pid);
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
            ) : (
              <div className="w-4" />
            )}
          </div>

          {/* Process Info */}
          <div className="flex-1 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {process.protected && (
                <Shield className="w-4 h-4 text-yellow-500" />
              )}
              <span className="text-white font-medium">{process.name}</span>
              <span className="text-gray-500 text-sm">PID: {process.pid}</span>
            </div>

            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1">
                <Zap className="w-3 h-3 text-blue-400" />
                <span className="text-gray-300">{process.cpu_percent}%</span>
              </div>
              <div className="text-gray-300">{process.memory_mb} MB</div>
              <span
                className={`px-2 py-1 rounded text-xs font-medium ${
                  process.status === "running"
                    ? "bg-green-500/20 text-green-400"
                    : process.status === "sleeping"
                    ? "bg-blue-500/20 text-blue-400"
                    : "bg-gray-500/20 text-gray-400"
                }`}
              >
                {process.status}
              </span>
              {hasChildren && (
                <span className="text-xs text-gray-500">
                  {process.children.length} child
                  {process.children.length !== 1 ? "ren" : ""}
                </span>
              )}
            </div>
          </div>
        </motion.div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div>
            {process.children.map((child) => (
              <ProcessNode key={child.pid} process={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Process Tree</h2>
          <p className="text-gray-400 mt-1">
            Hierarchical view of processes and their relationships
          </p>
        </div>
        <div className="text-sm text-gray-400">
          Total Processes:{" "}
          <span className="text-white font-semibold">{processes.length}</span>
        </div>
      </div>

      {/* Tree View */}
      <div className="glass-card overflow-hidden">
        <div className="max-h-[700px] overflow-y-auto">
          {processTree.length > 0 ? (
            processTree.map((process) => (
              <ProcessNode key={process.pid} process={process} />
            ))
          ) : (
            <div className="text-center py-12 text-gray-400">
              No processes available
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="glass-card p-4">
        <div className="flex items-center gap-6 text-sm text-gray-400">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-yellow-500" />
            <span>Protected System Process</span>
          </div>
          <div className="flex items-center gap-2">
            <ChevronRight className="w-4 h-4" />
            <span>Expandable (has children)</span>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-blue-400" />
            <span>CPU Usage</span>
          </div>
        </div>
      </div>
    </div>
  );
}
