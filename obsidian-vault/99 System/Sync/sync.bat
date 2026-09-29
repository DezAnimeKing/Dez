@echo off
cd /d "%~dp0"
python sync_excel.py %*
if errorlevel 1 py sync_excel.py %*
pause
