# Cyrillic Character Printing Fix

## Problem
The POS monoblock was printing unknown symbols (garbled text) instead of Cyrillic characters, while the notebook printed correctly.

## Root Cause
The issue was in the `printUsingSystemPrinter()` function for Windows (lines 97-223 in server.js):

1. **Font Selection**: The original code used `Courier New` font at size 8, which may not properly support Cyrillic characters on all Windows systems, especially on POS monoblocks with limited font installations.

2. **Encoding Handling**: While UTF-8 encoding was used, the file wasn't written with a UTF-8 BOM (Byte Order Mark), which can cause Windows applications to misinterpret the encoding.

3. **PowerShell Encoding**: The PowerShell script didn't explicitly set the console output encoding to UTF-8, which could cause character corruption.

## Solution Applied

### 1. UTF-8 BOM Added
```javascript
// Write content to temp file with UTF8 BOM for Windows compatibility
const utf8BOM = '\uFEFF';
fs.writeFileSync(tempFile, utf8BOM + content, 'utf8');
```

### 2. Improved PowerShell Script
- Set console output encoding to UTF-8
- Use `[System.IO.File]::ReadAllText()` with explicit UTF-8 encoding instead of `Get-Content`
- Implement font fallback mechanism

### 3. Font Fallback Mechanism
The script now tries multiple fonts with good Cyrillic support in order:
1. **Arial** - Best Cyrillic support, widely available
2. **Consolas** - Modern monospace font with Cyrillic
3. **Lucida Console** - Fallback monospace font
4. **Courier New** - Last resort
5. **GenericMonospace** - System default if all else fails

### 4. Increased Font Size
Changed from size 8 to size 9 for better readability and rendering.

## Why It Works Now

- **UTF-8 BOM**: Ensures Windows correctly identifies the file encoding
- **Explicit Encoding**: PowerShell explicitly reads the file as UTF-8
- **Better Fonts**: Arial and Consolas have comprehensive Cyrillic character sets
- **Fallback**: If preferred fonts aren't available, the system tries alternatives

## Testing
To test the fix:
1. Restart the server: `node server.js`
2. Send a print request with Cyrillic text
3. The receipt should now print correctly on the POS monoblock

## Technical Details
- **Character Set**: The thermal printer uses `CharacterSet.PC437_USA` which doesn't support Cyrillic
- **Fallback Method**: When direct thermal printing fails, the system printer fallback is used
- **Windows Compatibility**: The fix specifically addresses Windows system printer rendering
