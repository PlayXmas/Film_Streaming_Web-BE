#!/bin/sh
set -e

DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-3306}"

echo "Waiting for MySQL at ${DB_HOST}:${DB_PORT}..."
until nc -z "$DB_HOST" "$DB_PORT"; do
  sleep 1
done
echo "MySQL is up!"

# ENV cho sequelize-cli (mặc định development)
SEQUELIZE_ENV="${NODE_ENV:-development}"
DOCKER_SEQUELIZE_CONFIG="src/config/config.docker.json"


if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "Running migrations with ${DOCKER_SEQUELIZE_CONFIG} (env=${SEQUELIZE_ENV})..."
  npx sequelize-cli db:migrate --config "$DOCKER_SEQUELIZE_CONFIG" --env "$SEQUELIZE_ENV"
fi

if [ "$RUN_SEEDS" = "true" ]; then
  echo "Running seeders with ${DOCKER_SEQUELIZE_CONFIG} (env=${SEQUELIZE_ENV})..."
  npx sequelize-cli db:seed:all --config "$DOCKER_SEQUELIZE_CONFIG" --env "$SEQUELIZE_ENV"
fi

echo "Starting app: $@"
exec "$@"
