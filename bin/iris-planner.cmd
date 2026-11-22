@echo off
rem iris-planner (PowerShell / cmd) - IRIS planner command for sessions started by IRIS
if defined IRIS_PLANNER_NODE goto own
node "%~dp0iris-planner.mjs" %*
exit /b %errorlevel%
:own
"%IRIS_PLANNER_NODE%" "%~dp0iris-planner.mjs" %*
exit /b %errorlevel%
