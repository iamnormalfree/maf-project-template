@echo off
REM Windows batch wrapper for orchestrator-firewall.py
REM Executes the Python hook script with proper error handling

python "%~dp0orchestrator-firewall.py"
exit /b %ERRORLEVEL%
