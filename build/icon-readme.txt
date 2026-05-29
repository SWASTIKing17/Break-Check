Place your app icon here as:

  icon.ico  — Windows installer + taskbar icon (256x256 recommended, multi-size ICO)

If icon.ico is missing, electron-builder uses a default Electron icon.

To convert a PNG to ICO you can use:
  https://convertio.co/png-ico/
  or ImageMagick: magick convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
