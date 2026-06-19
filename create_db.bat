@echo off
set PGPASSWORD=postgres
"C:\Program Files\PostgreSQL\16\bin\createdb.exe" -U postgres ev_charging_local
echo Database created successfully!
