# nginx for AutoSoc

Place your TLS cert + key under `nginx/certs/`:

```
nginx/certs/fullchain.pem
nginx/certs/privkey.pem
```

For local testing with a self-signed cert:

```bash
mkdir -p nginx/certs
openssl req -x509 -newkey rsa:4096 -nodes -days 365 \
  -keyout nginx/certs/privkey.pem \
  -out nginx/certs/fullchain.pem \
  -subj "/CN=autosoc.local"
```

For production, use Let's Encrypt (certbot) or your corporate CA.

Reload with `docker compose restart nginx`.
