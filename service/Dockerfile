FROM node:16-alpine

# install docker
RUN apk add --update curl jq docker openrc
RUN rc-update add docker boot

# install snyk
RUN npm install -g snyk

WORKDIR /docker-swarm-snyk
COPY package*.json ./
RUN npm install --quiet
COPY src/ ./src/

EXPOSE 3000
EXPOSE 9229

CMD [ "npm", "run", "start" ]