@echo off
echo ========================================
echo    ReplyFlow - ngrok Public Access
echo ========================================
echo.

REM Check if ngrok is installed
where ngrok >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: ngrok is not installed or not in PATH
    echo.
    echo Install ngrok:
    echo   1. Download from https://ngrok.com/download
    echo   2. Extract and add to PATH
    echo   3. Run: ngrok config add-authtoken YOUR_TOKEN
    echo.
    pause
    exit /b 1
)

echo Starting ngrok tunnel for backend (port 5000)...
echo.
echo IMPORTANT: After ngrok starts, copy the forwarding URL
echo and update frontend/.env.local with:
echo   VITE_API_URL=https://YOUR-NGROK-URL/api
echo.
echo Then restart your frontend: npm run dev
echo.
echo ========================================
echo.

ngrok http 5000
