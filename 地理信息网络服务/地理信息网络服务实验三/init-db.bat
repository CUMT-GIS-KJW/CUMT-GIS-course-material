@echo off
cd /d "%~dp0"
set MYSQL_EXE=C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe

if not exist "%MYSQL_EXE%" (
  set MYSQL_EXE=mysql
)

"%MYSQL_EXE%" -u root -p < database\schema.sql

if errorlevel 1 (
  echo.
  echo Database initialization failed. Please check your MySQL root password.
) else (
  echo.
  echo Database message_board has been initialized.
)

pause
