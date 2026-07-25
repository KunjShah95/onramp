@echo off
REM Onramp daily briefing — regenerates the senior's inbox view each morning.
REM Registered as Windows Scheduled Task "Onramp Daily Briefing".
setlocal
cd /d "C:\AHS 2026\backend"
if not exist "..\logs" mkdir "..\logs"
echo ===== %DATE% %TIME% ===== >> "..\logs\daily_briefing.log"
".venv\Scripts\python.exe" "..\scripts\senior_inbox.py" >> "..\logs\daily_briefing.log" 2>&1
endlocal
