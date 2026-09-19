# Fix Emulator Black Screen and Screencap Issues

The Android emulator streaming shows a black screen due to hardware acceleration issues with `aosp_atd`. We will switch to the `default` target, adjust emulator options, add a robust screen wake sequence, and improve the `screencap` command with validation.

## Proposed Changes

### Emulator Configuration

We will update the emulator runner configuration in both the GitHub Actions workflow and the local templates to use a more stable target and GPU settings.

#### [MODIFY] [.github/workflows/kmp-sim.yml](file:///C:/Users/ABI/AndroidStudioProjects/IosSimTest/.github/workflows/kmp-sim.yml)
- Change `target` to `default`.
- Change `api-level` to `33`.
- Add `emulator-options` as specified.

#### [MODIFY] [tools/kmp-sim/templates/kmp-sim.yml](file:///C:/Users/ABI/AndroidStudioProjects/IosSimTest/tools/kmp-sim/templates/kmp-sim.yml)
- Synchronize these changes with the template file.

### Streaming Script Improvements

We will enhance `stream.sh` (and its template) to include a reliable screen wake sequence, a debug step for `screencap`, and validation in the Node.js streaming process.

#### [MODIFY] [.github/kmp-sim/stream.sh](file:///C:/Users/ABI/AndroidStudioProjects/IosSimTest/.github/kmp-sim/stream.sh)
- Add the explicit screen wake sequence:
  ```bash
  adb shell settings put global stay_on_while_plugged_in 3
  adb shell input keyevent KEYCODE_WAKEUP
  adb shell wm dismiss-keyguard
  sleep 3
  ```
- Add a debug step to verify `screencap` functionality before starting the stream.
- Update the Node.js one-liner to:
    - Redirect stderr of `screencap` to `/dev/null`.
    - Validate that the captured buffer starts with the PNG header (`0x89`, `0x50`) and has content before updating the frame buffer.

#### [MODIFY] [tools/kmp-sim/templates/stream.sh](file:///C:/Users/ABI/AndroidStudioProjects/IosSimTest/tools/kmp-sim/templates/stream.sh)
- Synchronize these changes with the template file.

## Verification Plan

### Automated Tests
- N/A (Build verification only, as this depends on emulator environment).

### Manual Verification
- The user can trigger the `kmp-sim` workflow and verify that the stream is no longer black and shows the app UI.
- Verify `cloudflared.log` or the debug output in the Actions log to see if `screencap` size is reported correctly.
