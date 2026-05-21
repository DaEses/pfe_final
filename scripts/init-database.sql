-- Création de la base PostgreSQL pour Job Finder
-- Usage (adapter -p 5432 ou 8080 selon votre installation) :
--   psql -U postgres -h localhost -p 5432 -f scripts/init-database.sql

CREATE DATABASE job_finder;

-- Les tables sont créées automatiquement par TypeORM au premier
-- démarrage du backend (NODE_ENV=development, synchronize=true).
