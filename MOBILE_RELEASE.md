# Mobile Release Notes

## Android APK

The Android project in `android/` wraps the live wardrobe app at:

`http://106.53.188.85/`

It supports:

- account registration before using the wardrobe
- WebView local storage and JavaScript
- camera/gallery upload through the web file picker
- cleartext HTTP access to the current Tencent Cloud IP

The GitHub Actions workflow `.github/workflows/android-apk.yml` builds a debug APK and uploads it as the artifact:

`winged-wardrobe-android-debug-apk`

For public distribution later, create a signed release APK/AAB and replace the IP URL with HTTPS on a domain.

## iOS TestFlight / App Store

iOS cannot be distributed as a free-floating install file. Use Apple Developer Program, Xcode, and App Store Connect:

1. Create an App Store Connect app record for `衣橱相机`.
2. Open the iOS wrapper project on a Mac with full Xcode installed.
3. Set the bundle identifier, team, signing certificate, and provisioning profile.
4. Archive the app in Xcode.
5. Upload to App Store Connect.
6. Add TestFlight internal testers, then submit for external testing or App Review.

Before Apple review, move the server to HTTPS and a real domain. Apple review is much smoother when the app uses HTTPS, has a privacy policy URL, and includes real screenshots captured from the app.
