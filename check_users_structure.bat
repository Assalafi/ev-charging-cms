@echo off
set PGPASSWORD=postgres
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -d ev_charging_local -c "\d users"
echo Users table structure completed!
