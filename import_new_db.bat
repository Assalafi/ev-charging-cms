@echo off
set PGPASSWORD=postgres
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -d ev_charging_local -f ev_charging_cms_dump_new.sql
echo Database import completed!
