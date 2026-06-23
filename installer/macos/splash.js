// First-run "installing" splash for the macOS app.
//
// Runs BEFORE the Python env exists (during `pixi install`), so it is pure
// JXA/Cocoa — no PIL/Tk available. Shows a small card with the app icon and two
// lines of text, then blocks in app.run() so the window stays up until the launch
// wrapper kills this process (_setup_done) when the install finishes.
//
// Icon path comes from the JBA_SPLASH_ICON env var (an .icns/.png); text is fixed.
//
// License: BSD 3-Clause
ObjC.import('Cocoa');

(function () {
  const env = $.NSProcessInfo.processInfo.environment;
  const iconPath = ObjC.unwrap(env.objectForKey('JBA_SPLASH_ICON')) || '';

  const app = $.NSApplication.sharedApplication;
  app.setActivationPolicy($.NSApplicationActivationPolicyAccessory);  // no Dock tile

  const W = 340, H = 300, PAD = 24, ICON = 196;   // ICON a bit larger than the Dock size
  const scr = $.NSScreen.mainScreen.frame;
  const win = $.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer(
    $.NSMakeRect((scr.size.width - W) / 2, (scr.size.height - H) / 2, W, H),
    $.NSWindowStyleMaskTitled | $.NSWindowStyleMaskClosable,   // closable → standard red-X button
    $.NSBackingStoreBuffered, false);
  win.setTitle('');
  win.setTitlebarAppearsTransparent(true);
  win.setTitleVisibility($.NSWindowTitleHidden);
  win.setLevel($.NSFloatingWindowLevel);
  win.setMovableByWindowBackground(true);

  // Clicking the red-X closes the window AND ends this process (the install keeps
  // running in the background; the launcher no longer needs to dismiss us).
  $.NSNotificationCenter.defaultCenter.addObserverForNameObjectQueueUsingBlock(
    $.NSWindowWillCloseNotification, win, $.NSOperationQueue.mainQueue,
    function (_n) { app.terminate(null); });

  const cv = win.contentView;

  const iv = $.NSImageView.alloc.initWithFrame(
    $.NSMakeRect((W - ICON) / 2, H - ICON - PAD, ICON, ICON));
  if (iconPath.length) {
    const img = $.NSImage.alloc.initWithContentsOfFile(iconPath);
    if (img && !img.isNil()) iv.setImage(img);
  }
  cv.addSubview(iv);

  function label(text, y, size, secondary) {
    const t = $.NSTextField.alloc.initWithFrame($.NSMakeRect(PAD, y, W - 2 * PAD, size + 10));
    t.setStringValue(text);
    t.setBezeled(false);
    t.setDrawsBackground(false);
    t.setEditable(false);
    t.setSelectable(false);
    t.setAlignment($.NSTextAlignmentCenter);
    t.setFont(secondary ? $.NSFont.systemFontOfSize(size) : $.NSFont.boldSystemFontOfSize(size));
    if (secondary) t.setTextColor($.NSColor.secondaryLabelColor);
    cv.addSubview(t);
  }
  label('Installing jupyter-bioacoustic', PAD + 28, 16, false);
  label('(this only happens once)', PAD, 12, true);

  win.makeKeyAndOrderFront(null);
  app.activateIgnoringOtherApps(true);
  app.run();
})();
