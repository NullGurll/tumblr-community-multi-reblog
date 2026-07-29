// SPDX-License-Identifier: MPL-2.0
async function checkStatus() {
  const status = document.querySelector("#status");
  const label = status.querySelector("b");
  const diagnostic = document.querySelector("#diagnostic");

  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const active = tabs[0];
    if (!active?.url?.startsWith("https://www.tumblr.com/")) {
      status.className = "status warning";
      label.textContent = "Open Tumblr first";
      diagnostic.textContent = "The extension only runs on www.tumblr.com.";
      return;
    }

    const result = await browser.tabs.sendMessage(active.id, { type: "tmr-status" });
    if (!result?.loaded) throw new Error("No response");

    if (result.pickerDetected && result.communityCount > 0) {
      label.textContent = `Picker detected · ${result.communityCount} Communities`;
      diagnostic.textContent = "Multi-select controls should be visible in the open picker.";
    } else {
      label.textContent = "Active on Tumblr";
      diagnostic.textContent =
        "Now open Reblog… → destination selector → Communities.";
    }
  } catch {
    status.className = "status error";
    label.textContent = "Not connected to this tab";
    diagnostic.textContent =
      "Reload the Tumblr tab after loading or updating the extension.";
  }
}

async function showBatchStatus() {
  try {
    const batch = await browser.runtime.sendMessage({ type: "tmr-get-batch-status" });
    if (!batch?.results?.length) return;

    const section = document.querySelector("#batch");
    const summary = document.querySelector("#batch-summary");
    const results = document.querySelector("#batch-results");
    section.hidden = false;
    summary.textContent = batch.state === "running"
      ? `${batch.settled}/${batch.total} complete`
      : `${batch.successes} succeeded · ${batch.failures} failed`;
    results.replaceChildren();

    for (const item of batch.results) {
      const row = document.createElement("div");
      row.className = "batch-row";
      row.dataset.status = item.status;
      row.title = item.error || item.status;

      const dot = document.createElement("span");
      dot.className = "batch-dot";
      const name = document.createElement("span");
      name.className = "batch-name";
      name.textContent = item.name;
      const attempts = document.createElement("span");
      attempts.className = "batch-attempts";
      attempts.textContent = item.attempts
        ? `${item.status} · ${item.attempts}/3`
        : item.status;

      row.append(dot, name, attempts);
      results.append(row);
    }
  } catch {
    // Batch history is optional; the main Tumblr status still works without it.
  }
}

checkStatus();
showBatchStatus();
