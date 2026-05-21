-- PostgreSQL — initialisation base Job Finder
-- Adapter le port si PostgreSQL n'écoute pas sur 8080 (voir README_FINAL.md).

CREATE DATABASE job_finder
  WITH ENCODING 'UTF8'
       LC_COLLATE = 'en_US.UTF-8'
       LC_CTYPE = 'en_US.UTF-8'
       TEMPLATE template0;

-- Sous Windows, si la commande ci-dessus échoue (locale), utiliser plutôt :
-- CREATE DATABASE job_finder;

-- Les tables sont créées automatiquement par TypeORM (synchronize) au premier démarrage du backend en NODE_ENV=development.
