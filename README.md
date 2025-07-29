# Focus Forge Chrome Extension

Focus Forge is a productivity-boosting Chrome extension that helps you stay focused by blocking distracting websites and tracking your browsing habits.

## Features

- **Distraction Blocker**: Block distracting websites with a customizable list
- **Study Mode**: Toggle blocking on/off with a simple power button
- **Usage Tracker**: Monitor which websites you visit and how much time you spend on them
- **AI Insights**: Get personalized productivity suggestions powered by Google's Gemini AI

## Installation

1. Clone this repository or download the ZIP file
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the extension folder
5. The Focus Forge icon should appear in your browser toolbar

## Usage

### Blocking Distractions

1. Click the Focus Forge icon in your browser toolbar
2. Add distracting websites to your block list (e.g., "youtube.com", "facebook.com")
3. Toggle the power button to enable Study Mode
4. When Study Mode is active, attempts to visit blocked sites will be prevented

### Tracking Usage

1. Click the "Tracker" tab in the popup
2. View your browsing statistics for today, this week, or monthly
3. See which sites you visit most frequently and how much time you spend on them

### AI Insights

1. Click the "AI Insights" tab in the popup
2. The extension will analyze your browsing habits using Gemini AI
3. Receive personalized suggestions to improve your productivity

## Recent Fixes

### Tracking Accuracy Improvements
- Fixed URL parsing to properly handle various URL formats
- Added better error handling for URL parsing errors
- Improved time tracking logic to prevent unrealistic time measurements
- Added filtering for browser-specific pages (chrome://, chrome-extension://, etc.)
- Added minimum time threshold (500ms) to avoid tracking micro-interactions

### Gemini AI Integration Fixes
- Improved error handling for API calls
- Fixed response parsing to correctly extract text from the API response
- Added better error messages and retry functionality
- Added validation for sufficient browsing data before making API calls

### UI Improvements
- Added styled error and notice messages
- Implemented retry button for failed AI requests
- Added better feedback when not enough browsing data is available

## Customization

You can customize the extension by modifying the following files:

- `manifest.json`: Extension configuration
- `background.js`: Core functionality and tracking logic
- `popup.html` and `popup.js`: User interface
- `popup.css`: Styling

## Privacy

All your browsing data is stored locally in your browser. The only external API call is to Google's Gemini AI when you request insights.

## License

This project is licensed under the MIT License - see the LICENSE file for details.