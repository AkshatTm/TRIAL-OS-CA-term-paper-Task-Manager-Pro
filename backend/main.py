"""
Task Manager Pro - Python FastAPI Backend
Provides REST API endpoints for system monitoring and process management
"""

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import psutil
import platform
from datetime import datetime
from typing import List, Dict, Optional
import os
import signal
import asyncio
import json

# Try to import GPUtil for GPU monitoring
try:
    import GPUtil
    GPU_AVAILABLE = True
except ImportError:
    GPU_AVAILABLE = False

# Pydantic Response Models for API documentation and validation
class ProcessInfo(BaseModel):
    pid: int
    name: str
    username: str
    cpu_percent: float
    memory_percent: float
    memory_mb: float
    status: str
    threads: int
    create_time: Optional[str]
    ppid: Optional[int]
    protected: bool

class ProcessListResponse(BaseModel):
    count: int
    processes: List[ProcessInfo]

class ActionResponse(BaseModel):
    success: bool
    message: str
    force: Optional[bool] = None
    confirmed: Optional[bool] = None

class CPUInfo(BaseModel):
    percent: float
    cores: Dict[str, int]
    frequency: Dict[str, float]
    per_core: List[float]

class MemoryInfo(BaseModel):
    total: int
    available: int
    used: int
    percent: float
    total_formatted: str
    available_formatted: str
    used_formatted: str

class SwapInfo(BaseModel):
    total: int
    used: int
    free: int
    percent: float

class DiskIOInfo(BaseModel):
    read_bytes: int
    write_bytes: int
    read_formatted: str
    write_formatted: str

class DiskInfo(BaseModel):
    total: int
    used: int
    free: int
    percent: float
    total_formatted: str
    used_formatted: str
    free_formatted: str
    io: DiskIOInfo

class NetworkInfo(BaseModel):
    bytes_sent: int
    bytes_recv: int
    packets_sent: int
    packets_recv: int
    bytes_sent_formatted: str
    bytes_recv_formatted: str

class SystemInfo(BaseModel):
    os: str
    release: str
    version: str
    machine: str
    processor: str
    boot_time: str
    uptime: str
    uptime_seconds: int

class SystemStatsResponse(BaseModel):
    timestamp: str
    cpu: CPUInfo
    memory: MemoryInfo
    swap: SwapInfo
    disk: DiskInfo
    network: NetworkInfo
    gpu: Optional[List[Dict]] = None
    gpu_available: bool
    system: SystemInfo

class PriorityChangeRequest(BaseModel):
    priority: int = Field(..., ge=-20, le=19, description="Process priority/nice value (-20 to 19)")

class PriorityResponse(BaseModel):
    success: bool
    message: str
    old_priority: Optional[int] = None
    new_priority: Optional[int] = None

# List of protected system processes that cannot be terminated
PROTECTED_PROCESSES = [
    'system', 'system idle process', 'registry', 'smss.exe', 'csrss.exe',
    'wininit.exe', 'services.exe', 'lsass.exe', 'winlogon.exe', 'dwm.exe',
    'svchost.exe', 'explorer.exe'
]

app = FastAPI(title="Task Manager Pro API", version="1.0.0")

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],  # Vite and CRA ports
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_size(bytes_value):
    """Convert bytes to human readable format"""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if bytes_value < 1024.0:
            return f"{bytes_value:.1f} {unit}"
        bytes_value /= 1024.0
    return f"{bytes_value:.1f} PB"

def is_protected_process(process_name, pid):
    """Check if a process is protected and should not be terminated"""
    process_name_lower = process_name.lower()
    
    # Check against protected process list
    for protected in PROTECTED_PROCESSES:
        if protected in process_name_lower:
            return True
    
    # Protect system processes (PID 0-10)
    if pid <= 10:
        return True
    
    return False

def get_gpu_info():
    """Get GPU information if available"""
    if not GPU_AVAILABLE:
        return None
    
    try:
        gpus = GPUtil.getGPUs()
        if not gpus:
            return None
        
        gpu_data = []
        for gpu in gpus:
            gpu_data.append({
                'id': gpu.id,
                'name': gpu.name,
                'load': round(gpu.load * 100, 1),  # Convert to percentage
                'memory_used': gpu.memoryUsed,
                'memory_total': gpu.memoryTotal,
                'memory_percent': round((gpu.memoryUsed / gpu.memoryTotal) * 100, 1) if gpu.memoryTotal > 0 else 0,
                'temperature': gpu.temperature,
                'uuid': gpu.uuid
            })
        
        return gpu_data
    except Exception as e:
        print(f"GPU monitoring error: {e}")
        return None

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Task Manager Pro API",
        "version": "1.0.0",
        "endpoints": [
            "/api/system/stats",
            "/api/processes",
            "/api/process/{pid}",
            "/api/process/{pid}/kill",
            "/api/process/{pid}/suspend",
            "/api/process/{pid}/resume"
        ]
    }

@app.get("/api/system/stats", response_model=SystemStatsResponse)
async def get_system_stats():
    """Get overall system statistics"""
    try:
        # CPU Stats - single sampling call for efficiency
        cpu_count_physical = psutil.cpu_count(logical=False)
        cpu_count_logical = psutil.cpu_count(logical=True)
        cpu_freq = psutil.cpu_freq()
        cpu_per_core = psutil.cpu_percent(interval=0.1, percpu=True)
        # Calculate overall CPU as average of all cores
        cpu_percent = sum(cpu_per_core) / len(cpu_per_core) if cpu_per_core else 0
        
        # Memory Stats
        memory = psutil.virtual_memory()
        swap = psutil.swap_memory()
        
        # Disk Stats
        disk_path = 'C:\\' if platform.system() == "Windows" else '/'
        disk = psutil.disk_usage(disk_path)
        disk_io = psutil.disk_io_counters()
        
        # Network Stats
        net_io = psutil.net_io_counters()
        
        # System Info
        boot_time = datetime.fromtimestamp(psutil.boot_time())
        uptime = datetime.now() - boot_time
        uptime_seconds = int(uptime.total_seconds())
        
        # GPU Info
        gpu_info = get_gpu_info()
        
        return {
            "timestamp": datetime.now().isoformat(),
            "cpu": {
                "percent": cpu_percent,
                "cores": {
                    "physical": cpu_count_physical,
                    "logical": cpu_count_logical
                },
                "frequency": {
                    "current": cpu_freq.current if cpu_freq else 0,
                    "min": cpu_freq.min if cpu_freq else 0,
                    "max": cpu_freq.max if cpu_freq else 0
                },
                "per_core": cpu_per_core
            },
            "memory": {
                "total": memory.total,
                "available": memory.available,
                "used": memory.used,
                "percent": memory.percent,
                "total_formatted": get_size(memory.total),
                "available_formatted": get_size(memory.available),
                "used_formatted": get_size(memory.used)
            },
            "swap": {
                "total": swap.total,
                "used": swap.used,
                "free": swap.free,
                "percent": swap.percent
            },
            "disk": {
                "total": disk.total,
                "used": disk.used,
                "free": disk.free,
                "percent": disk.percent,
                "total_formatted": get_size(disk.total),
                "used_formatted": get_size(disk.used),
                "free_formatted": get_size(disk.free),
                "io": {
                    "read_bytes": disk_io.read_bytes if disk_io else 0,
                    "write_bytes": disk_io.write_bytes if disk_io else 0,
                    "read_formatted": get_size(disk_io.read_bytes) if disk_io else "0 B",
                    "write_formatted": get_size(disk_io.write_bytes) if disk_io else "0 B"
                }
            },
            "network": {
                "bytes_sent": net_io.bytes_sent,
                "bytes_recv": net_io.bytes_recv,
                "packets_sent": net_io.packets_sent,
                "packets_recv": net_io.packets_recv,
                "bytes_sent_formatted": get_size(net_io.bytes_sent),
                "bytes_recv_formatted": get_size(net_io.bytes_recv)
            },
            "gpu": gpu_info,
            "gpu_available": GPU_AVAILABLE,
            "system": {
                "os": platform.system(),
                "release": platform.release(),
                "version": platform.version(),
                "machine": platform.machine(),
                "processor": platform.processor(),
                "boot_time": boot_time.isoformat(),
                "uptime": str(uptime).split('.')[0],  # Format as HH:MM:SS
                "uptime_seconds": uptime_seconds
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/processes", response_model=ProcessListResponse)
async def get_processes():
    """Get all running processes
    
    Note on CPU percentage normalization:
    psutil returns per-core CPU percentage (0-100% per core), which can sum to 
    N*100% on N-core systems. We normalize by dividing by logical CPU count to 
    show 0-100% range relative to total system capacity, making values more 
    intuitive for users (e.g., 50% = half of total system CPU, not half of one core).
    """
    try:
        processes = []
        num_cpus = psutil.cpu_count(logical=True)
        
        for proc in psutil.process_iter(['pid', 'name', 'username', 'cpu_percent', 
                                          'memory_percent', 'memory_info', 'status', 
                                          'create_time', 'num_threads', 'ppid']):
            try:
                pinfo = proc.info
                # Get CPU percentage and normalize it to 0-100% range
                # psutil returns per-core percentage, so divide by number of CPUs
                cpu_raw = pinfo['cpu_percent'] or 0
                cpu_normalized = cpu_raw / num_cpus if num_cpus > 0 else cpu_raw
                
                # Check if process is protected
                is_protected = is_protected_process(pinfo['name'], pinfo['pid'])
                
                processes.append({
                    'pid': pinfo['pid'],
                    'name': pinfo['name'],
                    'username': pinfo['username'] or 'N/A',
                    'cpu_percent': round(cpu_normalized, 1),
                    'memory_percent': round(pinfo['memory_percent'] or 0, 1),
                    'memory_mb': round((pinfo['memory_info'].rss / 1024 / 1024), 1) if pinfo['memory_info'] else 0,
                    'status': pinfo['status'],
                    'threads': pinfo['num_threads'] or 0,
                    'create_time': datetime.fromtimestamp(pinfo['create_time']).isoformat() if pinfo['create_time'] else None,
                    'ppid': pinfo['ppid'],
                    'protected': is_protected
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                pass
        
        return {
            "count": len(processes),
            "processes": processes
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/process/{pid}")
async def get_process_details(pid: int):
    """Get detailed information about a specific process - optimized for speed"""
    try:
        proc = psutil.Process(pid)
        
        # Quick check if process exists
        if not proc.is_running():
            raise HTTPException(status_code=404, detail=f"Process {pid} not found")
        
        with proc.oneshot():
            # Essential attributes only - fetch in one shot for speed
            base_attrs = [
                'pid', 'name', 'username', 'status', 'create_time',
                'cpu_percent', 'memory_percent', 'memory_info',
                'num_threads', 'ppid', 'cmdline', 'exe', 'cwd'
            ]
            
            pinfo = proc.as_dict(attrs=base_attrs)
            
            # Get connections count quickly (don't enumerate all)
            try:
                connections = proc.net_connections() if hasattr(proc, 'net_connections') else proc.connections()
                pinfo['connections'] = len(connections)
            except (psutil.AccessDenied, AttributeError, OSError):
                pinfo['connections'] = 0
            
            # Get open files count quickly
            try:
                open_files = proc.open_files()
                pinfo['open_files'] = len(open_files)
            except (psutil.AccessDenied, AttributeError, OSError):
                pinfo['open_files'] = 0
            
            # Format essential fields only
            if pinfo.get('create_time'):
                pinfo['create_time'] = datetime.fromtimestamp(pinfo['create_time']).isoformat()
            
            if pinfo.get('memory_info'):
                pinfo['memory_mb'] = round(pinfo['memory_info'].rss / 1024 / 1024, 1)
                pinfo['memory_formatted'] = get_size(pinfo['memory_info'].rss)
            
            # Add protected flag
            pinfo['protected'] = is_protected_process(pinfo.get('name', ''), pinfo.get('pid', 0))
            
            return pinfo
            
    except psutil.NoSuchProcess:
        raise HTTPException(status_code=404, detail=f"Process {pid} not found")
    except psutil.AccessDenied:
        raise HTTPException(status_code=403, detail=f"Access denied to process {pid}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/process/{pid}/kill", response_model=ActionResponse)
async def kill_process(pid: int, force: bool = Query(False, description="Force kill (SIGKILL) instead of graceful terminate (SIGTERM)")):
    """Kill a process (and its children if needed)"""
    try:
        proc = psutil.Process(pid)
        proc_name = proc.name()
        
        # Check if process is protected
        if is_protected_process(proc_name, pid):
            raise HTTPException(
                status_code=403, 
                detail=f"Cannot terminate '{proc_name}'. This is a protected system process."
            )
        
        # Kill child processes first for more reliable termination
        try:
            children = proc.children(recursive=True)
            for child in children:
                try:
                    if not is_protected_process(child.name(), child.pid):
                        child.kill() if force else child.terminate()
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
        
        if force:
            proc.kill()  # SIGKILL
        else:
            proc.terminate()  # SIGTERM
        
        # Wait briefly for process to terminate (0.5s for instant feel like Task Manager)
        try:
            proc.wait(timeout=0.5)
            return {
                "success": True,
                "message": f"Process {proc_name} (PID: {pid}) terminated successfully",
                "force": force
            }
        except psutil.TimeoutExpired:
            # Escalate to force kill if graceful termination failed
            if not force:
                try:
                    proc.kill()
                    proc.wait(timeout=0.5)
                    return {
                        "success": True,
                        "message": f"Process {proc_name} (PID: {pid}) force terminated",
                        "force": True
                    }
                except psutil.TimeoutExpired:
                    pass
            
            # Process is being stubborn but termination signal sent
            return {
                "success": True,
                "message": f"Process {pid} termination initiated (may take time)",
                "force": force,
                "confirmed": False
            }
    except psutil.NoSuchProcess:
        # Process already gone - this is actually success
        return {
            "success": True,
            "message": f"Process {pid} already terminated",
            "force": force
        }
    except psutil.AccessDenied:
        raise HTTPException(status_code=403, detail=f"Access denied. Cannot kill process {pid}. Try running as administrator.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/process/{pid}/suspend", response_model=ActionResponse)
async def suspend_process(pid: int):
    """Suspend a process"""
    try:
        proc = psutil.Process(pid)
        proc.suspend()
        
        return {
            "success": True,
            "message": f"Process {pid} suspended successfully"
        }
    except psutil.NoSuchProcess:
        raise HTTPException(status_code=404, detail=f"Process {pid} not found")
    except psutil.AccessDenied:
        raise HTTPException(status_code=403, detail=f"Access denied. Cannot suspend process {pid}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/process/{pid}/resume", response_model=ActionResponse)
async def resume_process(pid: int):
    """Resume a suspended process"""
    try:
        proc = psutil.Process(pid)
        proc.resume()
        
        return {
            "success": True,
            "message": f"Process {pid} resumed successfully"
        }
    except psutil.NoSuchProcess:
        raise HTTPException(status_code=404, detail=f"Process {pid} not found")
    except psutil.AccessDenied:
        raise HTTPException(status_code=403, detail=f"Access denied. Cannot resume process {pid}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/process/{pid}/priority", response_model=PriorityResponse)
async def set_process_priority(pid: int, request: PriorityChangeRequest):
    """Set process priority/nice value (Unix: -20 to 19, Windows: priority class)"""
    try:
        proc = psutil.Process(pid)
        proc_name = proc.name()
        
        # Check if process is protected
        if is_protected_process(proc_name, pid):
            raise HTTPException(
                status_code=403, 
                detail=f"Cannot change priority of '{proc_name}'. This is a protected system process."
            )
        
        # Get old priority/nice
        if platform.system() == "Windows":
            # Windows priority classes
            old_priority = proc.nice()
            # Map nice value to Windows priority class
            priority_map = {
                -20: psutil.HIGH_PRIORITY_CLASS,
                -10: psutil.ABOVE_NORMAL_PRIORITY_CLASS,
                0: psutil.NORMAL_PRIORITY_CLASS,
                10: psutil.BELOW_NORMAL_PRIORITY_CLASS,
                19: psutil.IDLE_PRIORITY_CLASS,
            }
            # Find closest match
            closest = min(priority_map.keys(), key=lambda x: abs(x - request.priority))
            proc.nice(priority_map[closest])
            new_priority = proc.nice()
        else:
            # Unix-like systems use nice values directly
            old_priority = proc.nice()
            proc.nice(request.priority)
            new_priority = proc.nice()
        
        return {
            "success": True,
            "message": f"Process {proc_name} (PID: {pid}) priority changed successfully",
            "old_priority": old_priority,
            "new_priority": new_priority
        }
    except psutil.NoSuchProcess:
        raise HTTPException(status_code=404, detail=f"Process {pid} not found")
    except psutil.AccessDenied:
        raise HTTPException(status_code=403, detail=f"Access denied. Cannot change priority for process {pid}. Try running as administrator.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# WebSocket endpoint for real-time updates
@app.websocket("/ws/system-stats")
async def websocket_system_stats(websocket: WebSocket):
    """WebSocket endpoint for real-time system stats push"""
    await websocket.accept()
    try:
        while True:
            # Get system stats (reuse the existing function logic)
            stats_response = await get_system_stats()
            
            # Send stats as JSON
            await websocket.send_json(stats_response.dict() if hasattr(stats_response, 'dict') else stats_response)
            
            # Wait 2 seconds before next update
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        print("WebSocket client disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")
        await websocket.close()

@app.websocket("/ws/processes")
async def websocket_processes(websocket: WebSocket):
    """WebSocket endpoint for real-time process list push"""
    await websocket.accept()
    try:
        while True:
            # Get process list (reuse the existing function logic)
            processes_response = await get_processes()
            
            # Send processes as JSON
            await websocket.send_json(processes_response)
            
            # Wait 2 seconds before next update
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        print("WebSocket client disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")
        await websocket.close()

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting Task Manager Pro Backend...")
    print("📡 API will be available at: http://localhost:8000")
    print("📚 API docs at: http://localhost:8000/docs")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
