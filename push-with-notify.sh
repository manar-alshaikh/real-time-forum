git push origin main

# Get last commit message only
MESSAGE="Git push: $(git log -1 --pretty=format:'%s')"

curl -H "Content-Type: application/json" \
  -X POST \
  -d "{\"content\": \"$MESSAGE\"}" \
  https://discordapp.com/api/webhooks/1395091748350328902/ZfOCYQXVANIUBbuZ7n7yV7c0E0j68pWk80j1hqSbCTtczbnE1Wuoskn7N9vTtQpWrf0r
