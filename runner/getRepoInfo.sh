#!/bin/sh

cd repos/$1 &&\
  git log --reverse --date-order --pretty="%H" |\
  xargs -Ihash bash -c \
    "git show hash:package.json 2>/dev/null |
     jq '.version' 2>/dev/null |
     xargs -Iversion echo version hash"
