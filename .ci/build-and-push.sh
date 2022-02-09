#!/bin/bash
set -e

COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.yml}
REGISTRY_URL=${REGISTRY_URL:-docker.io}
REGISTRY_USER=${REGISTRY_USER:-}
REGISTRY_PASSWORD=${REGISTRY_PASSWORD:-}

cp .env.example .env

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
  T=$1
  V=$2
  echo "build_and_push:
  - TARGET=$T
  - VERSION=$V"
  TARGET=$T VERSION=$V docker-compose -f $COMPOSE_FILE build
  TARGET=$T VERSION=$V docker-compose -f $COMPOSE_FILE push
}

VERSION=$(jq -r .version service/package.json)

docker_login
build_and_push "production" $VERSION
build_and_push "production" "latest"
docker_logout

git tag "v${VERSION}"
git push origin "v${VERSION}"
