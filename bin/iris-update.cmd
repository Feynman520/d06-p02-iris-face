@echo off
rem iris-update (PowerShell / cmd) - IRIS update command for sessions started by IRIS
if defined IRIS_UPDATE_NODE goto own
node "%~dp0iris-update.mjs" %*
exit /b %errorlevel%
:own
"%IRIS_UPDATE_NODE%" "%~dp0iris-update.mjs" %*
exit /b %errorlevel%
