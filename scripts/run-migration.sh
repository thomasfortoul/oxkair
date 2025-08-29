#!/bin/bash

# Migration Helper Script: Azure OID Schema Migration
# This script helps safely apply the OID-based schema migration
#
# Usage: ./run-migration.sh [environment]
# Example: ./run-migration.sh staging

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION_SQL="$SCRIPT_DIR/migrate-to-oid-schema.sql"
ENVIRONMENT="${1:-development}"

# Database connection variables (customize as needed)
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-oxkair}"
DB_USER="${DB_USER:-postgres}"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

confirm_action() {
    local prompt="$1"
    local response
    echo -e "${YELLOW}$prompt${NC}"
    read -r response
    case "$response" in
        [yY][eE][sS]|[yY]) return 0 ;;
        *) return 1 ;;
    esac
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check if psql is available
    if ! command -v psql &> /dev/null; then
        log_error "psql command not found. Please install PostgreSQL client tools."
        exit 1
    fi

    # Check if migration SQL file exists
    if [[ ! -f "$MIGRATION_SQL" ]]; then
        log_error "Migration SQL file not found: $MIGRATION_SQL"
        exit 1
    fi

    # Check if we can connect to database
    if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" &> /dev/null; then
        log_error "Cannot connect to database. Please check connection settings."
        log_info "Current settings: Host=$DB_HOST, Port=$DB_PORT, User=$DB_USER, Database=$DB_NAME"
        exit 1
    fi

    log_success "Prerequisites check passed"
}

show_environment_info() {
    log_info "Migration Environment Information:"
    echo "  Environment: $ENVIRONMENT"
    echo "  Database Host: $DB_HOST"
    echo "  Database Port: $DB_PORT"
    echo "  Database Name: $DB_NAME"
    echo "  Database User: $DB_USER"
    echo "  Migration SQL: $MIGRATION_SQL"
    echo ""
}

create_manual_backup() {
    local backup_dir="$SCRIPT_DIR/../backups"
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="$backup_dir/oxkair_backup_${ENVIRONMENT}_${timestamp}.sql"

    log_info "Creating manual database backup..."

    # Create backup directory if it doesn't exist
    mkdir -p "$backup_dir"

    # Create full database backup
    if pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" > "$backup_file"; then
        log_success "Database backup created: $backup_file"
        echo "BACKUP_FILE=$backup_file" > "$SCRIPT_DIR/.last_backup"
    else
        log_error "Failed to create database backup"
        exit 1
    fi
}

run_migration() {
    log_info "Running migration SQL script..."

    # Execute the migration
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$MIGRATION_SQL"; then
        log_success "Migration completed successfully!"
    else
        log_error "Migration failed!"
        log_warning "You can restore from backup if needed"
        exit 1
    fi
}

verify_migration() {
    log_info "Verifying migration results..."

    # Check if new tables exist with correct structure
    local verification_sql="
    DO \$\$
    BEGIN
        -- Check if profiles table exists with correct structure
        IF NOT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'profiles'
        ) THEN
            RAISE EXCEPTION 'profiles table does not exist';
        END IF;

        -- Check if profiles.id is UUID and primary key
        IF NOT EXISTS (
            SELECT FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = 'profiles'
            AND column_name = 'id'
            AND data_type = 'uuid'
        ) THEN
            RAISE EXCEPTION 'profiles.id is not UUID type';
        END IF;

        -- Check if medical_notes table exists
        IF NOT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'medical_notes'
        ) THEN
            RAISE EXCEPTION 'medical_notes table does not exist';
        END IF;

        -- Check if user_settings table exists
        IF NOT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'user_settings'
        ) THEN
            RAISE EXCEPTION 'user_settings table does not exist';
        END IF;

        RAISE NOTICE 'Migration verification passed!';
    END\$\$;
    "

    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "$verification_sql"; then
        log_success "Migration verification passed!"
    else
        log_error "Migration verification failed!"
        exit 1
    fi
}

show_next_steps() {
    log_info "Migration completed successfully!"
    echo ""
    log_info "Next Steps:"
    echo "1. 🚀 Deploy the updated application code"
    echo "2. 🧪 Test user sign-in to verify profile creation with OID"
    echo "3. 📝 Test medical notes creation and retrieval"
    echo "4. 👀 Monitor application logs for any errors"
    echo "5. 🔍 Verify all API endpoints work correctly"
    echo "6. 🗑️  Clean up backup tables after validation (optional)"
    echo ""
    log_warning "Keep your backup files until you're confident everything works correctly!"

    if [[ -f "$SCRIPT_DIR/.last_backup" ]]; then
        local backup_info=$(cat "$SCRIPT_DIR/.last_backup")
        echo "Latest backup: ${backup_info#BACKUP_FILE=}"
    fi
}

show_rollback_instructions() {
    echo ""
    log_warning "ROLLBACK INSTRUCTIONS (if needed):"
    echo "If you encounter issues and need to rollback:"
    echo "1. Stop your application"
    echo "2. Restore from backup:"
    if [[ -f "$SCRIPT_DIR/.last_backup" ]]; then
        local backup_file=$(cat "$SCRIPT_DIR/.last_backup" | cut -d'=' -f2)
        echo "   psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME < \"$backup_file\""
    else
        echo "   psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME < [your_backup_file.sql]"
    fi
    echo "3. Revert application code to previous version"
    echo "4. Restart application with previous version"
}

# Main execution
main() {
    echo "========================================"
    echo "   Azure OID Schema Migration Tool"
    echo "========================================"
    echo ""

    show_environment_info

    # Safety checks
    if [[ "$ENVIRONMENT" == "production" ]]; then
        log_warning "You are about to run migration on PRODUCTION!"
        if ! confirm_action "Are you absolutely sure you want to proceed? (yes/no): "; then
            log_info "Migration cancelled by user"
            exit 0
        fi
    fi

    # Confirm migration
    if ! confirm_action "This will DROP and RECREATE app tables. Continue? (yes/no): "; then
        log_info "Migration cancelled by user"
        exit 0
    fi

    # Execute migration steps
    check_prerequisites
    create_manual_backup
    run_migration
    verify_migration

    # Show completion info
    show_next_steps
    show_rollback_instructions

    log_success "Migration process completed! 🎉"
}

# Handle script interruption
trap 'log_error "Migration interrupted!"; exit 1' INT TERM

# Run main function
main "$@"
