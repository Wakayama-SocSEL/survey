#!/bin/sh

jq -s -R 'split("\n") |
  map(split(",")) |
  .[1:-1] |
  map(select(.[25] == "1")) |
  sort_by(.[-1]) |
  reverse |
  .[:1000] |
  { repoNames: map(.[7]) }'\
  ../dataset/pkg_repositories.csv > input.json
