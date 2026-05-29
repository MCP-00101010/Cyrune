@echo off
setlocal
cd /d "%~dp0"
echo Starting Morpheus EmuGUI...
echo.
echo Keep this window open while using the launcher.
echo Close it or press Ctrl+C here to stop the local server.
echo Open http://127.0.0.1:8765 in your browser.
echo.
python server.py --no-browser
echo.
pause
