Put the pdfium shared library for your platform in this folder:
  Windows: pdfium.dll    macOS: libpdfium.dylib    Linux: libpdfium.so
Prebuilt binaries: https://github.com/bblanchon/pdfium-binaries/releases (choose your OS/arch).
It is bundled into the installer via tauri.conf.json "bundle.resources", and found at runtime
next to the executable, in ./pdfium, or via the PDFIUM_PATH environment variable.
