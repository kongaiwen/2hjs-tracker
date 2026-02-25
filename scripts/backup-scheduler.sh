#!/bin/bash
# Automated database backup script - runs twice daily via cron
# Run: crontab -e and add:
# 0 6,18 * * * /path/to/2hjs-tracker/scripts/backup-scheduler.sh

set -e

BACKUP_DIR="/home/evie-marie-home/Projects/2hjs-tracker/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30  # Keep backups for 30 days

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting database backup..."

# Get database credentials from .env
source /home/evie-marie-home/Projects/2hjs-tracker/.env 2>/dev/null || true

# Create compressed backup via Docker
docker exec 2hjs-tracker_postgres_1 pg_dump -U 2hjs 2hjs_tracker | gzip > "$BACKUP_DIR/auto_backup_${TIMESTAMP}.sql.gz"

# Calculate backup size
BACKUP_SIZE=$(du -h "$BACKUP_DIR/auto_backup_${TIMESTAMP}.sql.gz" | cut -f1)
echo "[$(date)] Backup completed: $BACKUP_DIR/auto_backup_${TIMESTAMP}.sql.gz ($BACKUP_SIZE)"

# Clean up old backups (keep only last 30 days)
echo "[$(date)] Cleaning up backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "auto_backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete

# Also clean up manual backups older than 90 days
find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime +90 -delete

echo "[$(date)] Backup task completed successfully"
