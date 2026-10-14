#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
if [[ -d "$HOME/.cargo/bin" ]]; then export PATH="$HOME/.cargo/bin:$PATH"; fi

BUILD_MODE="debug"
SPLIT_PER_ABI=0
TARGETS=(aarch64)
TARGETS_EXPLICIT=0

usage() {
  cat <<'EOF'
Build a PDF Studio Android APK using the Tauri v2 CLI.

Usage:
  npm run android:apk
  npm run android:apk -- --release
  npm run android:apk -- --target aarch64 --target armv7 --split-per-abi

Options:
  --debug            Build a debug APK (default; suitable for local testing)
  --release          Build a release APK (configure Android signing before distribution)
  --target ARCH      Android ABI: aarch64, armv7, i686, or x86_64. Repeat for more.
  --split-per-abi    Generate a separate APK for each selected ABI.
  -h, --help         Show this help.

Environment:
  ANDROID_HOME or ANDROID_SDK_ROOT   Android SDK directory
  NDK_HOME or ANDROID_NDK_HOME       Installed side-by-side NDK directory (auto-detected if omitted)
  JAVA_HOME                          JDK directory (Android Studio's bundled JBR is suitable)
EOF
}

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

while (($#)); do
  case "$1" in
    --debug) BUILD_MODE="debug"; shift ;;
    --release) BUILD_MODE="release"; shift ;;
    --split-per-abi) SPLIT_PER_ABI=1; shift ;;
    --target)
      (($# >= 2)) || fail "--target requires an ABI name."
      if ((TARGETS_EXPLICIT == 0)); then TARGETS=(); TARGETS_EXPLICIT=1; fi
      TARGETS+=("$2")
      shift 2
      ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown option: $1 (use --help for usage)." ;;
  esac
done

command -v node >/dev/null 2>&1 || fail "Node.js is required. Install Node.js 20 or newer."
command -v npm >/dev/null 2>&1 || fail "npm is required."
command -v rustup >/dev/null 2>&1 || fail "rustup is required. Install Rust using rustup, then reopen the terminal."

if [[ -z "${JAVA_HOME:-}" || ! -x "${JAVA_HOME:-/nonexistent}/bin/java" || ! -x "${JAVA_HOME:-/nonexistent}/bin/javac" ]]; then
  fail "Set JAVA_HOME to a JDK (Android Studio's bundled jbr directory is suitable)."
fi

if [[ -n "${ANDROID_HOME:-}" ]]; then
  SDK_DIR="$ANDROID_HOME"
elif [[ -n "${ANDROID_SDK_ROOT:-}" ]]; then
  SDK_DIR="$ANDROID_SDK_ROOT"
elif [[ "${OSTYPE:-}" == darwin* ]]; then
  SDK_DIR="$HOME/Library/Android/sdk"
else
  SDK_DIR="$HOME/Android/Sdk"
fi

[[ -d "$SDK_DIR" ]] || fail "Android SDK not found at '$SDK_DIR'. Install Android Studio SDK components and set ANDROID_HOME or ANDROID_SDK_ROOT."
export ANDROID_HOME="$SDK_DIR"
export ANDROID_SDK_ROOT="$SDK_DIR"

if [[ -n "${NDK_HOME:-}" ]]; then
  NDK_DIR="$NDK_HOME"
elif [[ -n "${ANDROID_NDK_HOME:-}" ]]; then
  NDK_DIR="$ANDROID_NDK_HOME"
else
  shopt -s nullglob
  ndk_candidates=("$SDK_DIR"/ndk/*)
  shopt -u nullglob
  ((${#ndk_candidates[@]})) || fail "Android NDK not found under '$SDK_DIR/ndk'. Install NDK (Side by side) in Android Studio's SDK Manager."
  NDK_DIR="${ndk_candidates[0]}"
  for candidate in "${ndk_candidates[@]}"; do NDK_DIR="$candidate"; done
fi

[[ -f "$NDK_DIR/source.properties" && -d "$NDK_DIR/toolchains/llvm/prebuilt" ]] || fail "NDK_HOME does not look like an installed Android NDK: '$NDK_DIR'."
export NDK_HOME="$NDK_DIR"
export ANDROID_NDK_HOME="$NDK_DIR"

[[ -d "$SDK_DIR/platform-tools" ]] || fail "Android SDK Platform-Tools are missing. Install them with Android Studio's SDK Manager."
[[ -d "$SDK_DIR/build-tools" ]] || fail "Android SDK Build-Tools are missing. Install them with Android Studio's SDK Manager."
sdkmanager_found=0
for sdkmanager in "$SDK_DIR"/cmdline-tools/*/bin/sdkmanager "$SDK_DIR"/tools/bin/sdkmanager; do
  if [[ -x "$sdkmanager" ]]; then sdkmanager_found=1; break; fi
done
((sdkmanager_found == 1)) || fail "Android SDK Command-line Tools (sdkmanager) are missing. Install them with Android Studio's SDK Manager."
shopt -s nullglob
android_platforms=("$SDK_DIR"/platforms/android-*)
shopt -u nullglob
((${#android_platforms[@]})) || fail "No Android SDK Platform is installed. Install a platform in Android Studio's SDK Manager."

if [[ ! -x "$ROOT_DIR/node_modules/.bin/tauri" ]]; then
  printf 'Installing project npm dependencies...\n'
  npm install
fi
TAURI_CLI="$ROOT_DIR/node_modules/.bin/tauri"
[[ -x "$TAURI_CLI" ]] || fail "Tauri CLI was not installed. Check the npm install output."

rust_target_for_abi() {
  case "$1" in
    aarch64) printf '%s' 'aarch64-linux-android' ;;
    armv7) printf '%s' 'armv7-linux-androideabi' ;;
    i686) printf '%s' 'i686-linux-android' ;;
    x86_64) printf '%s' 'x86_64-linux-android' ;;
    *) fail "Unsupported Android ABI '$1'. Choose aarch64, armv7, i686, or x86_64." ;;
  esac
}

for abi in "${TARGETS[@]}"; do
  rust_target="$(rust_target_for_abi "$abi")"
  if ! rustup target list --installed | grep -Fxq "$rust_target"; then
    printf 'Installing Rust target %s...\n' "$rust_target"
    rustup target add "$rust_target"
  fi
done

ANDROID_PROJECT="$ROOT_DIR/src-tauri/gen/android"
if [[ ! -d "$ANDROID_PROJECT" ]]; then
  printf 'Initializing the Tauri Android project...\n'
  "$TAURI_CLI" android init --ci --skip-targets-install
else
  printf 'Using existing Android project at %s\n' "$ANDROID_PROJECT"
fi

printf 'Generating app icons from public/favicon.svg...\n'
"$TAURI_CLI" icon "$ROOT_DIR/public/favicon.svg"

if [[ "$BUILD_MODE" == "release" ]]; then
  printf 'Building release APK(s). Ensure release signing is configured before distributing them.\n'
else
  printf 'Building a debug APK suitable for local installation/testing.\n'
fi

build_args=(android build --apk --ci)
[[ "$BUILD_MODE" == "debug" ]] && build_args+=(--debug)
((SPLIT_PER_ABI == 0)) || build_args+=(--split-per-abi)
for abi in "${TARGETS[@]}"; do build_args+=(--target "$abi"); done
"$TAURI_CLI" "${build_args[@]}"

APK_DIR="$ANDROID_PROJECT/app/build/outputs/apk"
[[ -d "$APK_DIR" ]] || fail "Tauri reported a completed build, but no APK output directory was found under '$APK_DIR'."
APK_FILES=()
while IFS= read -r apk; do APK_FILES+=("$apk"); done < <(find "$APK_DIR" -type f -name '*.apk' -print | sort)
((${#APK_FILES[@]})) || fail "No APK files were produced in '$APK_DIR'."
printf '\nAPK build complete:\n'
for apk in "${APK_FILES[@]}"; do printf '  %s\n' "$apk"; done

if ! find "$ROOT_DIR/src-tauri/pdfium" -type f -name 'libpdfium.so' -print -quit 2>/dev/null | grep -q .; then
  printf '\nNote: no Android libpdfium.so was found in src-tauri/pdfium/. The APK may build, but PDFium-based rendering/compression features need an Android-compatible PDFium library and runtime loading setup. A desktop PDFium binary is not interchangeable.\n' >&2
fi
