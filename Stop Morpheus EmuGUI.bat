@echo off
setlocal
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8765" ^| findstr "LISTENING"') do (
    echo Stopping launcher server PID %%p
    taskkill /PID %%p /F >nul 2>nul
)
echo Done.
pause

