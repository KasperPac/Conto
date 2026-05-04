-- Postgres entrypoint: runs only on first container boot (when the data volume is empty).
-- Creates the test database alongside the default one.
create database conto_test;
grant all privileges on database conto_test to conto;
