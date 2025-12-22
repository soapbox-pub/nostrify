#!/usr/bin/env bash

BRANCH=better-type-checks

podman run -it --rm node:24 bash -c "
  git clone https://gitlab.com/soapbox-pub/nostrify.git &&
  cd nostrify &&
  git checkout $BRANCH &&
  corepack enable &&
  yes | pnpm i -r &&
  CI=true pnpm test &&
  exec bash
"