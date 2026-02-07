#!/bin/bash
# Find-A-Lifer Development Server Startup Script
# ================================================
# Starts both the FastAPI backend and Vite React frontend dev servers.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Find-A-Lifer Development Server ==="
echo ""

# Check Python
if command -v python &> /dev/null; then
    PYTHON_CMD="python"
elif command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
else
    echo "ERROR: Python not found. Please install Python 3.11+"
    exit 1
fi

echo "Python: $($PYTHON_CMD --version)"

# Check Node
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js not found. Please install Node 18+"
    exit 1
fi
echo "Node.js: $(node --version)"

# Install Python dependencies
echo ""
echo "Installing Python dependencies..."
$PYTHON_CMD -m pip install fastapi uvicorn --quiet 2>/dev/null || true

# Generate sample data if not exists
if [ ! -f "$SCRIPT_DIR/backend/data/species.json" ]; then
    echo "Generating sample data..."
    $PYTHON_CMD "$SCRIPT_DIR/backend/generate_sample_data.py"
fi

# Install frontend dependencies
if [ ! -d "$SCRIPT_DIR/frontend/node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install --prefix "$SCRIPT_DIR/frontend"
fi

# Kill any existing servers on our ports
echo ""
echo "Stopping any existing servers..."
kill $(lsof -t -i:8000 2>/dev/null) 2>/dev/null || true
kill $(lsof -t -i:5173 2>/dev/null) 2>/dev/null || true

# Start backend server
echo ""
echo "Starting FastAPI backend on http://localhost:8000..."
$PYTHON_CMD -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

# Wait for backend to start
sleep 2

# Start frontend dev server
echo ""
echo "Starting Vite frontend on http://localhost:5173..."
npm run dev --prefix "$SCRIPT_DIR/frontend" &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"

echo ""
echo "=== Servers Started ==="
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:5173"
echo "Health:   http://localhost:8000/api/health"
echo ""
echo "Press Ctrl+C to stop both servers"

# Trap to kill both on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM

# Wait for both
wait
