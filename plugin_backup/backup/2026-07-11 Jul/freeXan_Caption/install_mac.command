#!/bin/bash

# freeXan Caption by BloomX - One-Click Installer for Mac
# This script installs the extension and enables Adobe Debug Mode.

echo "------------------------------------------------"
echo "   freeXan Caption Installer - macOS v1.0.0"
echo "------------------------------------------------"

# 1. Define Target Path
# We install to the user-specific directory to avoid needing 'sudo'
TARGET_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions/com.bloomx.freexan.caption"

# 2. Create the target directory structure
echo "[1/3] Creating installation directory..."
mkdir -p "$TARGET_DIR"

# 3. Copy files from the current folder to the target
# We use -R for recursive and . to represent the current folder contents
echo "[2/3] Copying files to Adobe CEP folder..."
cp -R . "$TARGET_DIR"

# 4. Enable PlayerDebugMode
# This allows Premiere Pro to load the extension without a digital signature (development mode)
echo "[3/3] Enabling Adobe Debug Mode..."
for v in $(seq 5 17); do
  defaults write com.adobe.CSXS.$v PlayerDebugMode 1
done

echo "------------------------------------------------"
echo "      INSTALLATION SUCCESSFUL!"
echo "------------------------------------------------"
echo "1. Please restart Premiere Pro."
echo "2. Go to Window > Extensions > freeXan Caption."
echo "------------------------------------------------"

# Keep the terminal window open so the user can see the result
read -p "Press [Enter] to exit..."
