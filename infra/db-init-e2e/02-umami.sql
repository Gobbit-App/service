-- E2E only (docker-compose.e2e.yml): the role and database the local umami service expects.
CREATE ROLE umami LOGIN PASSWORD 'umami';
CREATE DATABASE umami OWNER umami;
