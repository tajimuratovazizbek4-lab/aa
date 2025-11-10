# Thermal Printer Service Setup

This guide explains how to set up and run the local Node.js service for automatic thermal printing from your web application.

## 🚀 Quick Start - Automatic Installation

**Want the service to start automatically without running `npm start`?**

👉 **See [START_HERE.md](START_HERE.md) for one-click installation!**

Simply run `QUICK_INSTALL.bat` as administrator and the service will:
- ✅ Start automatically with Windows
- ✅ Run in background (no manual start needed)
- ✅ Work immediately after computer restarts

For detailed instructions, see [AUTO_START_GUIDE.md](AUTO_START_GUIDE.md)

---

## Prerequisites

1. **Node.js**: You must have Node.js installed on the computer connected to the thermal printer. Download from [nodejs.org](https://nodejs.org)
2. **Printer Drivers**: Ensure your H-58C thermal printer is connected via USB and its drivers are correctly installed
3. **Printer Connection**: The printer should be powered on and not being used by another application

## Quick Setup

### Step 1: Install Dependencies
```bash
cd thermal-printer-service
npm install
```

### Step 2: Start the Service
```bash
npm start
```

The service will start on `http://localhost:3001` and automatically detect your H-58C thermal printer.

## Detailed Setup

### Step 1: Set Up the Project
1. Navigate to the `thermal-printer-service` directory
2. Install the required Node.js packages:
   ```bash
   npm install
   ```

### Step 2: (Optional) Configure Printer ID
For the most reliable connection, you can specify your printer's Vendor ID (VID) and Product ID (PID).

**On Windows:**
1. Open Device Manager
2. Find your printer under "Printers" or "Universal Serial Bus devices"
3. Right-click → Properties → Details tab
4. Select "Hardware Ids" from dropdown
5. Look for `USB\VID_04B8&PID_0202` format

**On Linux/macOS:**
```bash
lsusb
```
Look for your printer in the format: `Bus 001 Device 005: ID 04b8:0202`

**Update Configuration:**
If you found the VID/PID, edit `server.js` and update:
```javascript
const VENDOR_ID = '0x04b8';   // Your printer's Vendor ID
const PRODUCT_ID = '0x0202';  // Your printer's Product ID
```

### Step 3: Run the Service

**Development Mode:**
```bash
npm run dev
```

**Production Mode:**
```bash
npm start
```

**Install as Windows Service:**
```bash
npm run install-service
```

**Uninstall Windows Service:**
```bash
npm run uninstall-service
```

**Install as macOS LaunchAgent:**
```bash
npm run install-macos-service
```

**Uninstall macOS LaunchAgent:**
```bash
npm run uninstall-macos-service
```

## API Endpoints

- `GET /health` - Check service and printer status
- `POST /test-print` - Print a test receipt
- `POST /print-shift-closure` - Print shift closure receipt

## Testing

1. **Check Service Status:**
   ```bash
   curl http://localhost:3001/health
   ```

2. **Test Print:**
   ```bash
   curl -X POST http://localhost:3001/test-print
   ```

## Troubleshooting

### Printer Not Found
- Ensure printer is connected via USB and powered on
- Check that printer drivers are installed
- Try unplugging and reconnecting the printer
- Restart the service

### Permission Issues
- On Linux/macOS, you may need to run with sudo or add your user to the appropriate group
- On macOS, you might need to grant permission for USB device access in System Preferences > Security & Privacy
- On Windows, run as Administrator if needed

### Port Already in Use
- Change the port in `server.js` if 3001 is already in use
- Update the frontend service URL accordingly

## Integration with Frontend

The frontend automatically connects to `http://localhost:3001` when closing shifts. Ensure:

1. The thermal printer service is running
2. The printer is connected and ready
3. No firewall is blocking port 3001

## Service Status Indicators

- ✅ **Ready**: Printer connected and ready to print
- ❌ **Not Ready**: Printer not found or service unavailable
- 🔄 **Checking**: Service is checking printer status
- ❓ **Unknown**: Initial state before first check

## Automatic Printing Flow

1. User closes shift in the web application
2. Shift closure data is sent to API
3. Frontend automatically sends print request to thermal service
4. Receipt is printed without user interaction
5. User receives notification of print status

## Support

If you encounter issues:
1. Check the service logs in the terminal
2. Verify printer connection and drivers
3. Test with the test print endpoint
4. Check firewall and network settings