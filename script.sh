# 1. Authenticate to Fly registry
fly auth login
fly auth docker

docker push registry.fly.io/rag-server:latest
