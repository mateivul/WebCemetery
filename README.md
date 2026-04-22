# WebCemetery

A web extension I made to have a proper place for tabs to go after being killed (closed).
Something like history but a lot more cool!

## about it

So when you close a tab either with keyboard shortcut or manually or from the extension popup menu, it will be saved as a 'tombstone' in the WebCemetery dashboard, with all it's data. Then you can see all sort of stuff about all the tombstones (tabs killed) and you can also resurrect them :D
Also there are some other features like: auto-ghost which kills tabs not used for an time set by the user in the **Settings** page; and duplicate removal and a resource-heavy setting which kills tabs that use too much memory.
Also something cool is the epitaphs for each tombsotne which you can customize.

New features: browser notifications if you revisit a tab you killed many times, and custom epitaphs on manual kill.

### how you can insall it

Chrome / something running on Chromium

1. Download the crx from the release
2. Go to `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the crx file
5. you now have a cemetery for your tabs (it should be in the toolbar)

### how you can imporve it

1. Download or clone this repo
2. Go to `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the crx file
5. and now edit anything you want

### AI declaration:

- some of the epitaphs (tombstone text) were AI-generated (in lib/epitaph-generator.js).
- in v1.0.0 the style was created with AI, but I remade all of it myself in v2.0.0 and added new features.
