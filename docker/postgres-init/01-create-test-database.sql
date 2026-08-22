-- Dedicated database for the automated test suite (`npm test`).
-- Tests never run against the development database; created automatically on
-- first initialization of an empty data volume. See docs/engineering-log.md.
CREATE DATABASE pantry_test;