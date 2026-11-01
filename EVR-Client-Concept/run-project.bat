@echo off
setlocal
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
    echo npm was not found. Install Node.js, then try again.
    pause
    exit /b 1
)

echo Building EVR Productions...
call npm run build
if errorlevel 1 (
    echo The build failed. Review the error above and try again.
    pause
    exit /b 1
)

echo.
echo Starting the local EVR Productions server...
echo Keep this window open while you use the site.
echo.
call npx vercel dev
set "exitCode=%ERRORLEVEL%"

if not "%exitCode%"=="0" (
    echo.
    echo The local server stopped with exit code %exitCode%.
    pause
)

exit /b %exitCode%
