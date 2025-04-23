#!/bin/bash

# Build frontend
echo "📦 Building frontend..."
cd frontend/customerweb
npm install
npm run build

# Copy build to server
echo "🚚 Copying build to server folder..."
rm -rf ../../server/build
cp -r build ../../server/

# Back to server directory
cd ../../server

# Install backend deps
echo "🛠 Installing backend..."
npm install

# Done
echo "✅ Build ready. You can now deploy /server"
