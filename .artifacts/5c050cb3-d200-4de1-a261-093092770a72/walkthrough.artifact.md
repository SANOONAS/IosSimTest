# Walkthrough - Emulator Configuration and Streaming Fixes

We have modified the emulator settings and streaming script to resolve the hardware-acceleration rendering issues which resulted in a black screen.

## Changes Made

### Emulator Configuration Updates
Updated the `android-emulator-runner` configurations in:
- [.github/workflows/kmp-sim.yml](file:///C:/Users/ABI/AndroidStudioProjects/IosSimTest/.github/workflows/kmp-sim.yml)
- [tools/kmp-sim/templates/kmp-sim.yml](file:///C:/Users/ABI/AndroidStudioProjects/IosSimTest/tools/kmp-sim/templates/kmp-sim.yml)

**Modifications:**
- Changed `api-level` from `34` to `33`.
- Changed `target` from `aosp_atd` to `default`.
- Added `emulator-options: -no-snapshot-save -no-audio -gpu swiftshader_indirect -noaudio -no-boot-anim` to resolve the hardware acceleration rendering problems.

### Streaming Script Improvements
Enhanced the boot sequence, debugging, and verification steps in:
- [.github/kmp-sim/stream.sh](file:///C:/Users/ABI/AndroidStudioProjects/IosSimTest/.github/kmp-sim/stream.sh)
- [tools/kmp-sim/templates/stream.sh](file:///C:/Users/ABI/AndroidStudioProjects/IosSimTest/tools/kmp-sim/templates/stream.sh)

**Modifications:**
- Added an explicit screen wake sequence right after the device completes booting:
  ```bash
  adb shell settings put global stay_on_while_plugged_in 3
  adb shell input keyevent KEYCODE_WAKEUP
  adb shell wm dismiss-keyguard
  sleep 3
  ```
- Added a pre-streaming debug step to capture `/tmp/test.png` and log its size to verify `screencap` behavior.
- Updated the Node.js inline server script to use `adb exec-out screencap -p 2>/dev/null` and validate that incoming buffers match the expected PNG header (`0x89`, `0x50`), preventing corrupted or empty frames from corrupting the stream buffer.
