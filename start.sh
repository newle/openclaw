#!/bin/bash

# Treasure Hunt - One-Click Start & Deploy Script
# Usage: ./start.sh [mode]
# Modes:
#   dev     - Start both frontend and backend in development mode (default)
#   install - Install dependencies for both projects
#   build   - Build frontend and backend for production
#   prod    - Start backend in production mode (requires build)

MODE=${1:-dev}
ROOT_DIR=$(pwd)
BACKEND_DIR="$ROOT_DIR/treasure-hunt-backend"
FRONTEND_DIR="$ROOT_DIR/treasure-hunt-frontend"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[TreasureHunt]${NC} $1"
}

error() {
    echo -e "${RED}[Error]${NC} $1"
}

success() {
    echo -e "${GREEN}[Success]${NC} $1"
}

check_node() {
    if ! command -v node &> /dev/null; then
        error "Node.js is not installed. Please install Node.js v18+."
        exit 1
    fi
}

check_python() {
    if ! command -v python3 &> /dev/null; then
        error "Python 3 is not installed. Required for image matching service."
        exit 1
    fi
}

install_deps() {
    log "Installing Backend Dependencies..."
    cd "$BACKEND_DIR" || exit
    if [ ! -f "package.json" ]; then
        error "Backend package.json not found!"
        exit 1
    fi
    npm install
    success "Backend dependencies installed."

    # Setup Python environment if needed (Optional simplified check)
    # Ideally, we should check requirements.txt and install python deps
    # For now, we assume user has environment or relies on system python packages
    # as defined in backend/python/
    
    log "Installing Frontend Dependencies..."
    cd "$FRONTEND_DIR" || exit
    if [ ! -f "package.json" ]; then
        error "Frontend package.json not found!"
        exit 1
    fi
    npm install
    success "Frontend dependencies installed."
}

start_dev() {
    log "Starting Development Environment..."
    
    # Trap Ctrl+C to kill child processes
    trap 'kill $(jobs -p); exit' SIGINT SIGTERM

    cd "$BACKEND_DIR" || exit
    log "Starting Backend (Port 3000)..."
    npm run dev &
    BACKEND_PID=$!

    cd "$FRONTEND_DIR" || exit
    log "Starting Frontend (Vite)..."
    npm run dev &
    FRONTEND_PID=$!

    wait $BACKEND_PID $FRONTEND_PID
}

build_prod() {
    log "Building for Production..."
    
    cd "$BACKEND_DIR" || exit
    log "Building Backend..."
    npm run build
    
    cd "$FRONTEND_DIR" || exit
    log "Building Frontend..."
    npm run build
    
    success "Build complete."
}

start_prod() {
    log "Starting Production Server..."
    
    cd "$BACKEND_DIR" || exit
    if [ ! -d "dist" ]; then
        error "Dist directory not found. Please run './start.sh build' first."
        exit 1
    fi
    
    # In production, backend usually serves frontend static files or runs independently
    # For this setup, we assume backend might need configuration to serve frontend
    # OR we just start backend.
    
    # Note: To serve frontend via backend, we'd need to copy frontend/dist to backend/public
    # Let's add that step automatically for convenience.
    
    if [ -d "$FRONTEND_DIR/dist" ]; then
        log "Deploying Frontend build to Backend public directory..."
        mkdir -p public
        cp -r "$FRONTEND_DIR/dist/"* public/
        success "Frontend deployed to Backend."
    fi

    npm start
}

# Main Execution
check_node
check_python

case $MODE in
    install)
        install_deps
        ;;
    dev)
        # If node_modules missing, ask to install
        if [ ! -d "$BACKEND_DIR/node_modules" ] || [ ! -d "$FRONTEND_DIR/node_modules" ]; then
            log "Dependencies missing. Installing first..."
            install_deps
        fi
        start_dev
        ;;
    build)
        build_prod
        ;;
    prod)
        start_prod
        ;;
    *)
        echo "Usage: $0 {dev|install|build|prod}"
        exit 1
        ;;
esac
