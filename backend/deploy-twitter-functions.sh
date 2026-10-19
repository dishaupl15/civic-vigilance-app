#!/usr/bin/env bash
set -euo pipefail

echo "Deploying retired X/Twitter endpoints so older clients fail closed."

for function_name in post-tweet-civic post-tweet-user twitter-auth disconnect-twitter; do
  npx --yes supabase@2.121.0 functions deploy "$function_name"
done

echo "Retired endpoints deployed. The current app uses the user's X composer."
