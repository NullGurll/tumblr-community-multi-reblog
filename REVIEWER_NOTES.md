# Notes for Mozilla reviewers

## What the extension does

The extension adds checkboxes and a batch action to Tumblr's existing
Communities destination picker. After one user confirmation, it opens a
background Tumblr reblog tab and processes each selected Community sequentially.

## Testing

A Tumblr account that belongs to at least two Communities is required for a
complete functional test.

1. Sign in to a suitable Tumblr test account.
2. Open any rebloggable post.
3. Open **Reblog…** and the destination selector.
4. Select the **Communities** tab.
5. Select two or more Communities or choose **Select all**.
6. Choose **Reblog to N** and approve the confirmation.
7. Observe progress from the toolbar badge and popup.

No test credentials are stored in this repository. They can be supplied
privately in the AMO submission's reviewer notes if required.

## Source and build process

There is no build process. The submitted Firefox and Zen package contains the
files in `firefox/` unchanged. The code is plain, human-readable JavaScript,
HTML, and CSS. It is not bundled or minified and does not load remote code.

## Permissions

- `activeTab` and Tumblr host access: interact with the user-opened Tumblr
  composer and background worker tab.
- `tabs`: create and manage the background worker tab.
- `storage`: keep batch status locally for the popup.
- `notifications`: report batch completion.

The extension declares that it requires no data collection.
