#!/usr/bin/env bash
# One command to run FitCheck locally against the shared Tiger database. No containers.
# This file lives in backend/ (next to package.json), with client/ next to backend/.
#
#   bash backend/dev.sh               from the project root, or:  cd backend && bash dev.sh
#   bash backend/dev.sh --install     force npm install in both folders first

set -Eeuo pipefail

BACKEND_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$BACKEND_DIR/.." && pwd)"
CLIENT_DIR="$PROJECT_DIR/client"

usage() {
	echo "Usage: bash backend/dev.sh [--install]"
	echo "  --install  Run npm install in backend/ and client/ before starting."
}

FORCE_INSTALL=false
case "${1:-}" in
	"") ;;
	--install) FORCE_INSTALL=true ;;
	-h|--help)
		usage
		exit 0
		;;
	*)
		usage >&2
		exit 2
		;;
esac

if [[ ! -f "$BACKEND_DIR/.env" ]]; then
	echo "Missing backend/.env. Copy backend/.env.example to backend/.env and set DATABASE_URL and JWT_SECRET." >&2
	exit 1
fi

for key in DATABASE_URL JWT_SECRET; do
	if ! grep -Eq "^${key}=.+" "$BACKEND_DIR/.env"; then
		echo "Missing or empty $key in backend/.env." >&2
		exit 1
	fi
done

for app_dir in "$BACKEND_DIR" "$CLIENT_DIR"; do
	if [[ "$FORCE_INSTALL" == true || ! -d "$app_dir/node_modules" ]]; then
		echo "Installing dependencies in ${app_dir##*/}/..."
		npm --prefix "$app_dir" install
	fi
done

DATABASE_URL="$(
	cd "$BACKEND_DIR"
	node -e '
		require("dotenv").config();
		const configuredUrl = process.env.DATABASE_URL;
		const tigerUrl = process.env.TIMESCALE_SERVICE_URL;
		let selectedUrl = configuredUrl || tigerUrl;
		try {
			if (configuredUrl && tigerUrl && ["localhost", "127.0.0.1", "::1"].includes(new URL(configuredUrl).hostname)) {
				selectedUrl = tigerUrl;
				process.stderr.write("DATABASE_URL is local; using TIMESCALE_SERVICE_URL for this run.\n");
			}
			if (selectedUrl) new URL(selectedUrl);
		} catch {
			process.exit(1);
		}
		if (selectedUrl) process.stdout.write(selectedUrl);
	'
)"
if [[ -z "$DATABASE_URL" ]]; then
	echo "Could not resolve a database URL from backend/.env." >&2
	exit 1
fi
export DATABASE_URL

cleanup() {
	kill "$BACKEND_PID" "$CLIENT_PID" 2>/dev/null || true
	wait "$BACKEND_PID" 2>/dev/null || true
	wait "$CLIENT_PID" 2>/dev/null || true
}

echo "Starting FitCheck API and web client. Press Ctrl+C to stop both."
(
	cd "$BACKEND_DIR"
	exec npm run dev
) &
BACKEND_PID=$!
(
	cd "$CLIENT_DIR"
	exec npm run dev -- --host 127.0.0.1
) &
CLIENT_PID=$!

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

wait -n "$BACKEND_PID" "$CLIENT_PID"