@echo off
set PGPASSWORD=postgres
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -d ev_charging_local -c "SELECT id, username, email, role, active FROM users LIMIT 10;"
echo Users list completed!
