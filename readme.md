# docker-swarm-snyk

Welcome to **docker-swarm-snyk**!

With **docker-swarm-snyk** you can enable simple **global image scanning** for your entire **Docker Swarm**.
> See docs: <https://docs.docker.com/engine/scan/>

## Variables

| Required | Variable                          | Description                                                                           |
|----------|-----------------------------------|---------------------------------------------------------------------------------------|
|    *     | DOCKER_USERNAME                   | Docker Hub account.                                                                   |
|    *     | DOCKER_PASSWORD                   | Docker Hub password. (tip: this can be an <a href="https://docs.docker.com/docker-hub/access-tokens/">access token</a>) |
|    *     | SNYK_AUTH_TOKEN                   | Auth token for Snyk. (see <a href="https://docs.snyk.io/tutorials/amazon-web-services/aws-code-suite/snyk-security/create-account-and-obtain-a-token">docs</a>)                    |
|          | JOB_SCAN_INTERVAL_SECONDS  | How frequently to query Swarm for new images to scan. Default is 60 seconds.     |
|          | JOB_CHECK_INTERVAL_SECONDS | How frequently the Job should update queues. Default is 10 seconds.              |
|          | JOB_MAX_CONCURRENCY   | Maximum concurrency for image scanning. Default is 1.                                 |
|          | DATA_PATH             | Destination path to write scan data (internal). Default is `/docker-swarm-snyk/data`.       |
|          | SEVERITY              | You can set the severity flag to `low`, `medium`, or `high`. Default is `high`. (<a href="https://docs.docker.com/engine/scan/#limiting-the-level-of-vulnerabilities-displayed">docs</a>) |

## Volumes

| Volume                                        | Description                                                               |
|-----------------------------------------------|---------------------------------------------------------------------------|
| `/var/run/docker.sock:/var/run/docker.sock`   | Map the Docker socket from host to container.                             |
| `/path/to/docker-swarm-snyk/data:/docker-swarm-snyk/data` | Host or network level path to map docker-swarm-snyk data to for persistence.    |

## Example

Create a sample `docker-compose.yml`...

``` yml
version: "3.8"

services:
  docker-swarm-snyk:
    image: rjchicago/docker-swarm-snyk:${VERSION:-latest}
    environment:
      - SEVERITY=${SEVERITY:-high}
    secrets:
      - source: env_secrets
        target: /docker-swarm-snyk/.env
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - docker-swarm-snyk_data:/docker-swarm-snyk/data
    ports:
      - "3000:3000"
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role == manager

volumes:
  docker-swarm-snyk_data:

secrets:
  env_secrets:
    name: docker-swarm-snyk.v1.env
    file: .env
```

> note: change the port as needed. default is `3000`.

Next create a `.env` file and replace the values with your username and tokens...

``` sh
# write example .env
printf "DOCKER_USERNAME=user
DOCKER_PASSWORD=password
SNYK_AUTH_TOKEN=token" > .env

# replace .env values
vi .env
```

Docker must be running in Swarm mode - call `init` as needed...

``` sh
# init swarm mode
docker swarm init
```

Now deploy the stack locally - optionally name your stack...

``` sh
# deploy docker-swarm-snyk
docker stack deploy -c docker-compose.yml ${STACK:-demo}
```

Trigger a scan of your local Swarm...

``` sh
# trigger a local scan
curl -s -X GET "http://localhost:3000/scan" | jq
```

``` json
{
  "pushed": [
    "rjchicago/docker-swarm-snyk:latest@sha256:85353320eab99904dac065464f3d6742f59611d6f22d79bf7cf8df3b1fa6a7c5"
  ]
}
```

You can monitor the job queue here...

``` sh
# check queue
curl -s -X GET "http://localhost:3000/queue" | jq
```

``` json
{
  "inProgress": [
    {
      "image": "rjchicago/docker-swarm-snyk:latest@sha256:85353320eab99904dac065464f3d6742f59611d6f22d79bf7cf8df3b1fa6a7c5",
      "start": "2022-01-27T18:41:21.268Z",
      "seconds_elapsed": 2.761
    }
  ],
  "queue": []
}
```

Finally, check the status of your Swarm scans...

``` sh
# swarm info
curl -s -X GET "http://localhost:3000/swarm" | jq
```

``` json
[
  {
    "stackName": "demo",
    "serviceName": "demo_docker-swarm-snyk",
    "imageFull": "rjchicago/docker-swarm-snyk:latest@sha256:85353320eab99904dac065464f3d6742f59611d6f22d79bf7cf8df3b1fa6a7c5",
    "image": "rjchicago/docker-swarm-snyk",
    "tag": "latest",
    "sha": "sha256:85353320eab99904dac065464f3d6742f59611d6f22d79bf7cf8df3b1fa6a7c5",
    "results": "http://localhost:3000/results?image=rjchicago/docker-swarm-snyk:latest@sha256:85353320eab99904dac065464f3d6742f59611d6f22d79bf7cf8df3b1fa6a7c5"
  }
]
```

> Scans that are complete will display in the `results` link.

### Sample Scan Results

Below is a sample scan based on the above image:tag@sha...

``` txt
Testing rjchicago/docker-swarm-snyk:latest@sha256:85353320eab99904dac065464f3d6742f59611d6f22d79bf7cf8df3b1fa6a7c5...

Organization:      rjchicago
Package manager:   apk
Project name:      docker-image|rjchicago/docker-swarm-snyk:latest
Docker image:      rjchicago/docker-swarm-snyk:latest@sha256:85353320eab99904dac065464f3d6742f59611d6f22d79bf7cf8df3b1fa6a7c5
Platform:          linux/amd64
Base image:        node:16.13.2-alpine3.15
Licenses:          enabled

✔ Tested 40 dependencies for known issues, no vulnerable paths found.

According to our scan, you are currently using the most secure version of the selected base image

-------------------------------------------------------

Testing rjchicago/docker-swarm-snyk:latest@sha256:85353320eab99904dac065464f3d6742f59611d6f22d79bf7cf8df3b1fa6a7c5...

Organization:      rjchicago
Package manager:   npm
Target file:       /docker-swarm-snyk/package.json
Project name:      docker-swarm-snyk
Docker image:      rjchicago/docker-swarm-snyk:latest@sha256:85353320eab99904dac065464f3d6742f59611d6f22d79bf7cf8df3b1fa6a7c5
Licenses:          enabled

✔ Tested 112 dependencies for known issues, no vulnerable paths found.


Tested 2 projects, no vulnerable paths were found.
```

### UI

While there isn't a UI yet, all requests are GET and navigable from the browser:

<http://localhost:3000>

``` yml
[GET] ./health
[GET] ./version
[GET] ./swarm
[GET] ./scan
[GET] ./queue
```

### Cleanup

To cleanup, simply call...

``` sh
# remove stack
docker stack rm ${STACK:-demo}

# remove volume
docker volume rm ${STACK:-demo}_docker-swarm-snyk_data

# remove secret
docker secret rm docker-swarm-snyk.v1.env
```
