# Winged Wardrobe iOS Wrapper

This folder contains the iOS WebView wrapper source for TestFlight / App Store.

To make a real TestFlight build:

1. Install full Xcode from the Mac App Store.
2. Install XcodeGen or create a new iOS App project and add the files in `WingedWardrobe/`.
3. Set your Apple Developer Team in Xcode signing settings.
4. Use bundle identifier `com.samara.wingedwardrobe` or your own verified identifier.
5. Archive and upload from Xcode Organizer to App Store Connect.

The app currently loads:

`http://106.53.188.85/`

Before external TestFlight/App Review, switch the server to HTTPS on a real domain.
