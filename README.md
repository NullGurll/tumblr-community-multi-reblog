# Tumblr Community Multi-Reblog

Tumblr Community Multi-Reblog adds multi-select controls to Tumblr's native
Community destination picker. Select two or more Communities, approve the batch
once, and the extension processes each reblog sequentially in a background tab.

## Features

- Select multiple Tumblr Communities or use **Select all**
- Approve the complete batch with one confirmation
- Keep browsing while a background worker handles the batch
- Track pending, posting, retrying, posted, and failed destinations
- Retry failed Communities up to two additional times
- Verify the selected Community twice before pressing Reblog
- Refuse to post when Tumblr falls back to the user's home blog
- Store batch status locally without analytics or developer data collection

## Browser builds

| Folder | Browser | Package |
| --- | --- | --- |
| `firefox/` | Firefox and Zen Browser | `.xpi` |
| `chromium/` | Chromium-based browsers, including Brave, Chrome, Edge, Opera, and Vivaldi | `.zip` |

Firefox and Zen use the WebExtensions `browser` API and share the same XPI.
Chromium-based browsers use the equivalent `chrome` API build.

## Install for testing

### Firefox and Zen Browser

1. Open `about:debugging`.
2. Choose **This Firefox**.
3. Select **Load Temporary Add-on**.
4. Select `firefox/manifest.json`.

### Chromium-based browsers

1. Open the browser's extensions page, such as `brave://extensions` or
   `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select the `chromium/` folder.

## Use

1. Sign in to Tumblr.
2. Open a post's reblog composer.
3. Open the destination selector and choose **Communities**.
4. Select at least two Communities.
5. Choose **Reblog to N** and approve the confirmation.
6. Keep the browser open until the toolbar badge and notification report
   completion.

The extension deliberately waits for Tumblr to settle between submissions.
Before each click on **Reblog**, it verifies the intended Community twice and
reports that exact destination to the background worker. A dashboard navigation
cannot count as success until that verification is received.

## Privacy

The extension does not collect, sell, transmit, or analyze personal data. It
does not request or store a Tumblr password. Selected Community names and batch
results are kept in the browser's local extension storage so the toolbar popup
can display progress.

See [PRIVACY.md](PRIVACY.md) for the complete statement.

## Development

The project uses plain JavaScript, HTML, and CSS. There is no compilation,
bundling, minification, generated code, or remote code.

Validate JavaScript with:

```sh
node --check firefox/background.js
node --check firefox/content.js
node --check zen/background.js
node --check zen/content.js
node --check chromium/background.js
node --check chromium/content.js
```

## License

Mozilla Public License 2.0. See [LICENSE](LICENSE).
