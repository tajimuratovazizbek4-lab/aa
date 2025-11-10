# 🚀 Quick Start - Automatic Thermal Printer Service

## ⚡ One-Click Installation (Easiest)

1. **Right-click** `QUICK_INSTALL.bat`
2. Select **"Run as administrator"**
3. Wait for installation to complete
4. Done! Service will now start automatically

---

## 📋 What This Does

After installation:
- ✅ Service starts automatically when Windows boots
- ✅ Runs in background (no window)
- ✅ No need to manually run `npm start`
- ✅ Works even after computer restarts
- ✅ Your POS app can print immediately

---

## 🧪 Test It Works

### 1. Check Service Status
Open browser: http://localhost:3001/health

Should show:
```json
{
  "status": "ok",
  "printer_ready": true
}
```

### 2. Test Print
Open browser: http://localhost:3001/test-print

Your printer should print a test receipt.

### 3. Restart Computer
After reboot, check http://localhost:3001/health again.
It should work without doing anything!

---

## 🔧 Manage the Service

### View Service Status
- Press `Win + R`
- Type `services.msc` (for Windows Service)
- OR type `taskschd.msc` (for Task Scheduler)
- Find: **H58C-Thermal-Print-Service** or **ThermalPrinterService**

### Stop Service
```bash
# Windows Service method:
sc stop H58C-Thermal-Print-Service

# Task Scheduler method:
schtasks /end /tn "ThermalPrinterService"
```

### Start Service
```bash
# Windows Service method:
sc start H58C-Thermal-Print-Service

# Task Scheduler method:
schtasks /run /tn "ThermalPrinterService"
```

---

## ❌ Uninstall

**Right-click** one of these and select "Run as administrator":
- `UNINSTALL_SERVICE.bat` (if you used Windows Service)
- `UNINSTALL_TASK_SCHEDULER.bat` (if you used Task Scheduler)

---

## 📚 Need More Details?

See `AUTO_START_GUIDE.md` for:
- Detailed installation steps
- Troubleshooting guide
- Configuration options
- Advanced management

---

## ⚠️ Troubleshooting

### Service won't start
1. Make sure Node.js is installed: `node --version`
2. Run manually first to check for errors: `node server.js`
3. Check printer is connected and powered on

### Port already in use
```bash
# Find what's using port 3001
netstat -ano | findstr :3001

# Kill that process (replace PID with actual number)
taskkill /PID <PID> /F

# Restart service
```

### Printer not found
1. Check USB connection
2. Install printer drivers
3. Check in Windows: `wmic printer get name`

---

## ✅ Success Checklist

After installation, verify:
- [ ] http://localhost:3001/health returns OK
- [ ] Test print works
- [ ] Service appears in Services/Task Scheduler
- [ ] Service starts after computer reboot

---

## 🎯 For Your POS Application

Your POS app can now send print requests to:
```
POST http://localhost:3001/print-shift-closure
POST http://localhost:3001/print-sale-receipt
POST http://localhost:3001/test-print
```

The service will always be running and ready!
