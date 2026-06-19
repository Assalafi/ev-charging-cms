@echo off
set PGPASSWORD=postgres
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -d ev_charging_local -f ev_charging_prod_dump.sql
echo Database import completed!
