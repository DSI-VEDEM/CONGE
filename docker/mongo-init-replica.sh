#!/usr/bin/env bash
set -euo pipefail

# wait for mongod to accept connections
for i in {1..30}; do
  if mongosh --eval "db.adminCommand({ ping: 1 })" >/dev/null 2>&1; then
    break
  fi
  sleep 1
  if [[ $i -eq 30 ]]; then
    echo "mongod did not start in time" >&2
    exit 1
  fi
done

# only initialize once
if mongosh --eval "rs.status().ok" >/dev/null 2>&1; then
  echo "Replica set already initialized"
  exit 0
fi

mongosh <<'MONGOSH'
rs.initiate({
  _id: "rs0",
  members: [{ _id: 0, host: "127.0.0.1:27017" }]
})
MONGOSH
