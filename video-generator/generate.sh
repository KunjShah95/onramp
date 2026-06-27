#!/bin/bash
# CodeFlow Video Generator - Complete Pipeline
# Run this script to generate the complete promotional video

set -e

echo "========================================"
echo "CodeFlow Video Generator"
echo "========================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed"
    echo "Please install Node.js from https://nodejs.org"
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

echo ""
echo "Starting video generation pipeline..."
echo ""

# Run the complete pipeline
node generate-all.js

echo ""
echo "========================================"
echo "Generation Complete!"
echo "========================================"
echo ""
echo "Output files are in the output/ directory"
echo "Final video: output/codeflow-final.mp4"
echo ""
