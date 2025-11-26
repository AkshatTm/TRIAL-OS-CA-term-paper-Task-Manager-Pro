/**
 * Application-wide constants
 * Centralized configuration values for maintainability
 */

// Polling intervals (milliseconds)
export const POLL_INTERVAL_MS = 2000; // 2 seconds

// Historical data sizes
export const CPU_HISTORY_LENGTH = 20;
export const MEMORY_HISTORY_LENGTH = 20;
export const PERFORMANCE_HISTORY_LENGTH = 60;

// UI Configuration
export const MAX_PROCESSES_DISPLAY = 100; // Number of processes to display in table

// Alert thresholds (percentage)
export const CPU_ALERT_THRESHOLD = 85;
export const MEMORY_ALERT_THRESHOLD = 80;
export const DISK_ALERT_THRESHOLD = 90;

// API Configuration
export const API_BASE_URL = "http://localhost:8000";
export const WS_BASE_URL = "ws://localhost:8000";
