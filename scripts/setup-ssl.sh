#!/bin/bash
# CodeFlow - SSL Certificate Setup
# Run this script on the production server to obtain Let's Encrypt certificates.
# Requires: certbot, domain pointed to this server, port 80/443 accessible.

set -e

DOMAIN="${1:-codeflow.dev}"
EMAIL="${2:-admin@codeflow.dev}"

echo "=== CodeFlow SSL Setup ==="
echo "Domain: $DOMAIN"
echo "Email: $EMAIL"

# Install certbot if not present
if ! command -v certbot &> /dev/null; then
    echo "Installing certbot..."
    apt-get update && apt-get install -y certbot
fi

# Obtain certificate
sudo certbot certonly --standalone \
    -d "$DOMAIN" \
    -d "api.$DOMAIN" \
    --email "$EMAIL" \
    --agree-tos \
    --non-interactive

# Copy to nginx SSL directory
CERT_DIR="./ssl"
mkdir -p "$CERT_DIR"
cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$CERT_DIR/"
cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$CERT_DIR/"

echo "Certificates installed to $CERT_DIR/"
echo "Set up auto-renewal: certbot renew --deploy-hook 'cp ...'"
