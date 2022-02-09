#!/bin/bash
set -e

COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.yml}
REGISTRY_URL=${REGISTRY_URL:-docker.io}
REGISTRY_USER=${REGISTRY_USER:-}
REGISTRY_PASSWORD=${REGISTRY_PASSWORD:-}

TARGET="production"
VERSION=$(jq -r .version service/package.json)

if [[ -z $REGISTRY_USER ]] ; then
  echo "REGISTRY_USER is required" && exit 1
fi
if [[ -z $REGISTRY_PASSWORD ]] ; then
  echo "REGISTRY_PASSWORD is required" && exit 1
fi

function docker_login {
  export DOCKER_CONFIG="$(pwd)/.docker"
  echo "$REGISTRY_PASSWORD" | docker login -u $REGISTRY_USER --password-stdin $REGISTRY_URL
}

function docker_logout {
  docker logout $REGISTRY_URL
}

function build_and_push {
  TARGET=$1
  VERSION=$2
  echo "build_and_push:
  - TARGET=$TARGET
  - VERSION=$VERSION"
  TARGET=$TARGET VERSION=$VERSION docker-compose -f $COMPOSE_FILE build
  TARGET=$TARGET VERSION=$VERSION docker-compose -f $COMPOSE_FILE push
}

docker_login
build_and_push "production" $(jq -r .version package.json)
build_and_push "production" "latest"
docker_logout