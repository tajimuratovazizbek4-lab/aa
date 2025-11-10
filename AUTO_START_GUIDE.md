# Automatic Startup Guide for Thermal Printer Service

This guide explains how to make the thermal printer service start automatically without manually running `npm start`.

## 🎯 Two Methods Available

### Method 1: Windows Service (Recommended)
**Pros:**
- Proper Windows service integration
- Better service management
- Automatic restart on failure
- Runs before user login

**Cons:**
- Requires `node-windows` package
- Slightly more complex

### Method 2: Task Scheduler (Simpler Alternative)
**Pros:**
- No additional packages needed
- Simple and reliable
- Easy to manage

**Cons:**
- Less integrated than a proper service

---

## 📦 Method 1: Windows Service Installation

### Step 1: Install Dependencies
```bash
npm install
```

This will install `node-windows` package needed for the service.

### Step 2: Run Installation Script
**Right-click** `INSTALL_AUTO_START.bat` and select **"Run as administrator"**

The script will:
1. ✓ Check Node.js installation
2. ✓ Install all dependencies
3. ✓ Install the Windows service
4. ✓ Start the service automatically

### Step 3: Verify Installation
- Open Services: Press `Win + R`, type `services.msc`, press Enter
- Find: **"H58C-Thermal-Print-Service"**
- Status should be: **Running**
- Startup type should be: **Automatic**

### Managing the Service
```bash
# Check status
sc query H58C-Thermal-Print-Service

# Stop service
sc stop H58C-Thermal-Print-Service

# Start service
sc start H58C-Thermal-Print-Service

# Restart service
sc stop H58C-Thermal-Print-Service && sc start H58C-Thermal-Print-Service
```

### Uninstall Service
**Right-click** `UNINSTALL_SERVICE.bat` and select **"Run as administrator"**

---

## 📅 Method 2: Task Scheduler Installation (Simpler)

### Step 1: Run Installation Script
**Right-click** `INSTALL_TASK_SCHEDULER.bat` and select **"Run as administrator"**

The script will:
1. ✓ Check Node.js installation
2. ✓ Install dependencies
3. ✓ Create scheduled task
4. ✓ Start the service

### Step 2: Verify Installation
- Open Task Scheduler: Press `Win + R`, type `taskschd.msc`, press Enter
- Find: **"ThermalPrinterService"**
- Status should be: **Running**
- Trigger should be: **At system startup**

### Managing the Task
```bash
# Start task
schtasks /run /tn "ThermalPrinterService"

# Stop task
schtasks /end /tn "ThermalPrinterService"

# Check status
schtasks /query /tn "ThermalPrinterService"
```

### Uninstall Task
**Right-click** `UNINSTALL_TASK_SCHEDULER.bat` and select **"Run as administrator"**

---

## 🧪 Testing the Auto-Start

After installation, test the service:

### 1. Check if service is running
Open browser and go to: http://localhost:3001/health

You should see:
```json
{
  "status": "ok",
  "printer_ready": true,
  "timestamp": "2025-11-09T..."
}
```

### 2. Test printing
```bash
curl -X POST http://localhost:3001/test-print
```

### 3. Restart computer
After reboot, the service should automatically start. Check again:
- http://localhost:3001/health

---

## 🔧 Troubleshooting

### Service won't start
1. Check Node.js is installed: `node --version`
2. Check dependencies: `npm install`
3. Check Windows Event Viewer for errors
4. Try running manually first: `node server.js`

### Port 3001 already in use
1. Find process using port: `netstat -ano | findstr :3001`
2. Kill process: `taskkill /PID <process_id> /F`
3. Restart service

### Printer not detected
1. Ensure printer is connected via USB
2. Check printer is powered on
3. Install printer drivers if needed
4. Check Windows Device Manager

### Service starts but doesn't print
1. Check printer connection
2. Test with manual start: `node server.js`
3. Check service logs in Event Viewer
4. Verify printer name in Windows: `wmic printer get name`

---

## 📝 Service Configuration

### Change Port
Edit `server.js` line 15:
```javascript
const port = 3001; // Change to your desired port
```

Then reinstall the service.

### View Logs

**Method 1 (Windows Service):**
- Check: `C:\ProgramData\H58C-Thermal-Print-Service\daemon\`
- Or Windows Event Viewer → Application logs

**Method 2 (Task Scheduler):**
- Task Scheduler → ThermalPrinterService → History tab

---

## 🚀 Quick Start Commands

### Install and start automatically:
```bash
# Method 1: Windows Service
Right-click INSTALL_AUTO_START.bat → Run as administrator

# Method 2: Task Scheduler
Right-click INSTALL_TASK_SCHEDULER.bat → Run as administrator
```

### Uninstall:
```bash
# Method 1: Windows Service
Right-click UNINSTALL_SERVICE.bat → Run as administrator

# Method 2: Task Scheduler
Right-click UNINSTALL_TASK_SCHEDULER.bat → Run as administrator
```

---

## ✅ What Happens After Installation

1. **On Windows Startup:**
   - Service starts automatically
   - Runs in background (no window)
   - Available at http://localhost:3001

2. **Your POS Application:**
   - Can immediately send print requests
   - No need to manually start the service
   - Works even after computer restarts

3. **Service Management:**
   - Runs as SYSTEM user (background)
   - Automatically restarts on failure
   - Logs available in Event Viewer

---

## 🎉 Success Indicators

After successful installation, you should see:

✓ Service running in Services/Task Scheduler  
✓ http://localhost:3001/health returns status  
✓ Test print works  
✓ Service starts after computer reboot  
✓ POS application can print receipts  

---

## 📞 Need Help?

If you encounter issues:
1. Check the troubleshooting section above
2. Run manual test: `node server.js`
3. Check Windows Event Viewer for errors
4. Verify printer connection and drivers
