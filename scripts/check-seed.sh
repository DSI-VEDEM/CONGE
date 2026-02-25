#!/usr/bin/env bash
set -euo pipefail

compose_file="docker-compose.prod.yml"
while getopts "c:" opt; do
  case $opt in
    c) compose_file=$OPTARG ;;
    *)
      echo "Usage: $0 [-c compose-file]" >&2
      exit 2
      ;;
  esac
done

emails=(
  "pdg@conge.local"
  "comptable.daf@conge.local"
  "dsi.admin@conge.local"
  "directeur.operations@conge.local"
  "sous-directeur-operations-1@conge.local"
  "sous-directeur-operations-2@conge.local"
  "sous-directeur-operations-3@conge.local"
)

quoted=$(printf "'%s'," "${emails[@]}")
quoted=${quoted%,}
query="db.Employee.find({ email: { $in: [${quoted}] } }).projection({ email:1, firstName:1, role:1 }).toArray()"

docker compose -f "$compose_file" exec mongo mongosh --quiet --eval "$query"
