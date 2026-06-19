@echo off
set PGPASSWORD=postgres
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -d ev_charging_local -c "SELECT * FROM settings WHERE category = 'pricing' LIMIT 10;"
echo Settings table check completed!
