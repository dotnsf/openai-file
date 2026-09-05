# https://nodejs.org/ja/docs/guides/nodejs-docker-webapp/

# base image
FROM node:18-alpine

# working directory
WORKDIR /usr/src/app

COPY package*.json ./

# https://www.fixes.pub/program/323374.html
# https://stackoverflow.com/questions/69860233/cant-install-python-package-on-alpine-docker-anymore
# RUN apk update && apk upgrade && apk add python3 alpine-sdk
RUN apk update && apk upgrade

RUN npm install

COPY . .

EXPOSE 3000
CMD ["node", "server.js"]



