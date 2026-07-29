// SPDX-License-Identifier: MPL-2.0
(() => {
  "use strict";

  const state = {
    selected: new Map(),
    running: false,
    allowNativeCommunityClick: false,
    sourcePermalink: null
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function showReadyNotice() {
    if (document.querySelector(".tmr-ready-notice")) return;
    const notice = document.createElement("div");
    notice.className = "tmr-ready-notice";
    notice.textContent = "Multi-Reblog ready";
    document.body.append(notice);
    requestAnimationFrame(() => notice.classList.add("tmr-ready-visible"));
    setTimeout(() => {
      notice.classList.remove("tmr-ready-visible");
      setTimeout(() => notice.remove(), 250);
    }, 2600);
  }

  function text(element) {
    return (element?.innerText || element?.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function createElement(tagName, className = "", content = "") {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (content) element.textContent = content;
    return element;
  }

  function visible(element) {
    if (!element || !element.isConnected) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" &&
      style.visibility !== "hidden" &&
      rect.width > 0 &&
      rect.height > 0;
  }

  function dialogs() {
    return [...document.querySelectorAll('[role="dialog"]')].filter(visible);
  }

  function findCommunityPicker() {
    const dialog = dialogs().find((item) =>
      [...item.querySelectorAll("button")]
        .some((button) => /@@[a-z0-9-]+/i.test(text(button))) ||
      [...item.querySelectorAll('[role="tab"]')]
        .some((tab) => text(tab) === "Communities")
    );
    if (dialog) return dialog;

    const selectedTab = [...document.querySelectorAll('[role="tab"]')]
      .find((tab) => visible(tab) && text(tab) === "Communities");
    return selectedTab?.closest('[role="dialog"]') ||
      selectedTab?.parentElement?.parentElement?.parentElement ||
      null;
  }

  function hasCommunitiesTab(dialog) {
    return Boolean(dialog) && (
      [...dialog.querySelectorAll('[role="tab"]')]
        .some((tab) => text(tab) === "Communities")
    );
  }

  function findComposer() {
    return dialogs().find((dialog) =>
      [...dialog.querySelectorAll("button")]
        .some((button) => text(button) === "Reblog") &&
      dialog.querySelector('input[placeholder="#add tags"], [aria-label="Tags editor"]')
    );
  }

  function getCommunityButtons(picker = findCommunityPicker()) {
    const scope = picker || document;
    return [...scope.querySelectorAll("button")].filter((button) =>
      visible(button) &&
      /@@[a-z0-9-]+/i.test(text(button))
    );
  }

  function communityFromButton(button) {
    const label = text(button);
    const handle = label.match(/@@[a-z0-9-]+/i)?.[0] || label;
    const name = label
      .replace(/^avatar\s*/i, "")
      .replace(/\s*@@[a-z0-9-]+\s*$/i, "")
      .trim();
    return { handle, name: name || handle };
  }

  function findButton(root, predicate) {
    return [...root.querySelectorAll("button, [role='button'], [role='menuitem'], [role='tab']")]
      .find((element) => visible(element) && predicate(element, text(element)));
  }

  async function waitFor(find, timeout = 10000, message = "Tumblr did not update in time.") {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const result = find();
      if (result) return result;
      await sleep(100);
    }
    throw new Error(message);
  }

  function captureSourcePermalink() {
    const composer = findComposer();
    if (!composer) return;
    const link = [...composer.querySelectorAll('a[href*="/"]')].find((item) =>
      /^\/[^/]+\/\d+/.test(item.getAttribute("href") || "")
    );
    if (link) {
      state.sourcePermalink = (link.getAttribute("href") || "").split("?")[0];
    }
  }

  function updatePicker(picker) {
    if (!picker || state.running) return;
    const communityButtons = getCommunityButtons(picker);
    if (!communityButtons.length) return;

    captureSourcePermalink();
    picker.classList.add("tmr-picker");

    for (const button of communityButtons) {
      const community = communityFromButton(button);
      button.dataset.tmrCommunity = community.handle;
      button.classList.add("tmr-community-choice");
      button.setAttribute(
        "aria-pressed",
        state.selected.has(community.handle) ? "true" : "false"
      );
      if (!button.querySelector(".tmr-check")) {
        const check = document.createElement("span");
        check.className = "tmr-check";
        check.setAttribute("aria-hidden", "true");
        button.prepend(check);
      }
    }

    let footer = picker.querySelector(".tmr-footer");
    if (!footer) {
      footer = createElement("div", "tmr-footer");
      const information = createElement("div");
      const detected = createElement("strong", "tmr-detected", "Multi-select active");
      const summary = createElement("div", "tmr-selection-summary");
      summary.setAttribute("aria-live", "polite");
      information.append(detected, summary);

      const actions = createElement("div", "tmr-footer-actions");
      const selectAll = createElement("button", "tmr-select-all", "Select all");
      selectAll.type = "button";
      const submit = createElement("button", "tmr-submit");
      submit.type = "button";
      actions.append(selectAll, submit);
      footer.append(information, actions);

      const panel = [...picker.querySelectorAll('[role="tabpanel"]')]
        .find((item) => text(item).includes("@@"));
      (panel || picker).append(footer);
      footer.querySelector(".tmr-submit").addEventListener("click", startRun);
      footer.querySelector(".tmr-select-all").addEventListener("click", () => {
        const buttons = getCommunityButtons(findCommunityPicker());
        const communities = buttons.map(communityFromButton);
        const allSelected = communities.length > 0 &&
          communities.every((community) => state.selected.has(community.handle));

        if (allSelected) {
          for (const community of communities) {
            state.selected.delete(community.handle);
          }
        } else {
          for (const community of communities) {
            state.selected.set(community.handle, community);
          }
        }
        updatePicker(findCommunityPicker());
      });
    }

    const count = state.selected.size;
    footer.querySelector(".tmr-selection-summary").textContent =
      count ? `${count} ${count === 1 ? "Community" : "Communities"} selected` :
        "Select two or more Communities";
    const submit = footer.querySelector(".tmr-submit");
    submit.textContent = count ? `Reblog to ${count}` : "Reblog to selected";
    submit.disabled = count < 2;
    const visibleCommunities = communityButtons.map(communityFromButton);
    const allVisibleSelected = visibleCommunities.length > 0 &&
      visibleCommunities.every((community) => state.selected.has(community.handle));
    footer.querySelector(".tmr-select-all").textContent =
      allVisibleSelected ? "Clear all" : "Select all";
  }

  function toggleCommunity(button) {
    const community = communityFromButton(button);
    if (state.selected.has(community.handle)) {
      state.selected.delete(community.handle);
    } else {
      state.selected.set(community.handle, community);
    }
    updatePicker(findCommunityPicker());
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-tmr-community]");
    if (!button || state.allowNativeCommunityClick || state.running) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toggleCommunity(button);
  }, true);

  function showProgress(communities) {
    document.querySelector(".tmr-progress")?.remove();
    const panel = createElement("section", "tmr-progress");
    panel.setAttribute("role", "status");
    const header = createElement("div", "tmr-progress-header");
    header.append(
      createElement("strong", "", "Multi-Reblog"),
      createElement("span", "tmr-progress-count", "Starting…")
    );
    const list = createElement("div", "tmr-progress-items");
    panel.append(header, list);

    for (const community of communities) {
      const row = createElement("div", "tmr-progress-row");
      row.dataset.handle = community.handle;
      row.append(
        createElement("span", "tmr-status-dot"),
        createElement("span", "", community.name)
      );
      list.append(row);
    }
    document.body.append(panel);
    return panel;
  }

  function setRow(panel, handle, status, detail = "") {
    const row = [...panel.querySelectorAll(".tmr-progress-row")]
      .find((item) => item.dataset.handle === handle);
    if (!row) return;
    row.dataset.status = status;
    row.title = detail;
  }

  function setProgressCount(panel, completed, total) {
    panel.querySelector(".tmr-progress-count").textContent =
      `${completed} of ${total} complete`;
  }

  async function nativeSelectCommunity(community) {
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (attempt > 0) await openCommunityPicker();
      const picker = await waitFor(findCommunityPicker, 10000, "The Community picker did not open.");
      const communitiesTab = findButton(
        picker,
        (element, label) => element.getAttribute("role") === "tab" && label === "Communities"
      );
      if (communitiesTab?.getAttribute("aria-selected") !== "true") {
        communitiesTab?.click();
        await sleep(800);
      }
      const button = await waitFor(
        () => getCommunityButtons(findCommunityPicker())
          .find((item) => communityFromButton(item).handle === community.handle),
        10000,
        `${community.name} is no longer available in the Community picker.`
      );
      state.allowNativeCommunityClick = true;
      try {
        button.click();
      } finally {
        state.allowNativeCommunityClick = false;
      }
      await waitFor(() => !findCommunityPicker(), 10000, "The Community picker did not close.");
      await sleep(1800);
      try {
        await verifySelectedCommunity(community);
        await sleep(1200);
        await verifySelectedCommunity(community);
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error(`Tumblr did not keep ${community.name} selected.`);
  }

  async function verifySelectedCommunity(community) {
    const composer = await waitFor(findComposer, 10000, "The reblog composer is missing.");
    const selector = findButton(composer, (element) =>
      (element.getAttribute("aria-label") || "").startsWith("Select a blog.")
    );
    if (!selector) {
      throw new Error("Tumblr's destination selector is unavailable.");
    }

    const selectedText = text(selector).toLowerCase();
    const expectedName = community.name.toLowerCase();
    const expectedHandle = community.handle.replace(/^@@/, "").toLowerCase();
    if (!selectedText.includes(expectedName) && !selectedText.includes(expectedHandle)) {
      throw new Error(
        `Tumblr did not switch the destination to ${community.name}; submission stopped to prevent a duplicate.`
      );
    }
  }

  async function submitCurrentComposer(community, workerContext = null) {
    await verifySelectedCommunity(community);
    await sleep(800);
    await verifySelectedCommunity(community);
    if (workerContext) {
      await chrome.runtime.sendMessage({
        type: "tmr-worker-destination-confirmed",
        jobId: workerContext.jobId,
        itemIndex: workerContext.itemIndex,
        handle: community.handle
      });
    }
    const composer = await waitFor(findComposer, 10000, "The reblog composer is missing.");
    const submit = findButton(composer, (element, label) =>
      element.tagName === "BUTTON" && label === "Reblog" && !element.disabled
    );
    if (!submit) throw new Error("Tumblr's Reblog button is unavailable.");
    submit.click();

    // Tumblr keeps the dedicated reblog composer open after a successful
    // Community reblog. Give its request time to finish, then wait until the
    // composer is ready for the next destination instead of waiting for it to
    // disappear.
    await sleep(2500);
    await waitFor(() => {
      const currentComposer = findComposer();
      if (!currentComposer) return true;
      return Boolean(findButton(currentComposer, (element, label) =>
        element.tagName === "BUTTON" && label === "Reblog" && !element.disabled
      ));
    }, 20000, "Tumblr did not finish the reblog.");
  }

  function sourceArticle() {
    if (!state.sourcePermalink) return null;
    const parts = state.sourcePermalink.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const prefix = `/${parts[0]}/${parts[1]}`;
    const link = [...document.querySelectorAll("article a[href]")]
      .find((item) => (item.getAttribute("href") || "").startsWith(prefix));
    return link?.closest("article") || null;
  }

  async function reopenComposer() {
    const article = await waitFor(sourceArticle, 10000, "The original post is no longer on the page.");
    const reblog = findButton(article, (element, label) =>
      element.tagName === "BUTTON" &&
      (element.getAttribute("aria-label") || label).startsWith("Reblog")
    );
    if (!reblog) throw new Error("The post's Reblog control is unavailable.");
    reblog.click();

    const menuItem = await waitFor(
      () => [...document.querySelectorAll('[role="menuitem"]')]
        .find((item) => visible(item) && /^Reblog…?$/.test(text(item))),
      5000,
      "Tumblr's reblog menu did not open."
    );
    menuItem.click();
    await waitFor(findComposer, 10000, "The reblog composer did not reopen.");
  }

  async function openCommunityPicker() {
    const composer = await waitFor(findComposer);
    const selector = findButton(composer, (element) =>
      (element.getAttribute("aria-label") || "").startsWith("Select a blog.")
    );
    if (!selector) throw new Error("Tumblr's destination selector is unavailable.");
    selector.click();
    const picker = await waitFor(findCommunityPicker);
    const tab = findButton(picker, (element, label) =>
      element.getAttribute("role") === "tab" && label === "Communities"
    );
    if (!tab) throw new Error("Tumblr's Communities tab is unavailable.");
    if (tab.getAttribute("aria-selected") !== "true") tab.click();
  }

  function closeComposerAfterRun() {
    const composer = findComposer();
    if (!composer) return false;
    const close = [...composer.querySelectorAll("button")]
      .find((button) => visible(button) && text(button) === "Close");
    close?.click();
    return Boolean(close);
  }

  function findDiscardPrompt() {
    return [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')]
      .find((dialog) =>
        visible(dialog) &&
        dialog !== findComposer() &&
        /discard(?:\s+this)?\s+post/i.test(text(dialog))
      );
  }

  function confirmDiscardPrompt(prompt) {
    if (!prompt) return false;
    const discard = [...prompt.querySelectorAll("button")]
      .find((button) =>
        visible(button) &&
        /^(discard|discard post|discard this post)$/i.test(text(button))
      );
    discard?.click();
    return Boolean(discard);
  }

  async function closeCurrentComposer() {
    if (!findComposer()) return;
    if (!closeComposerAfterRun()) {
      throw new Error("Tumblr's Close button is unavailable.");
    }

    const closeResult = await waitFor(() => {
      if (!findComposer()) return { closed: true };
      const prompt = findDiscardPrompt();
      return prompt ? { prompt } : null;
    }, 5000, "Tumblr did not respond to the Close button.");

    if (closeResult.prompt) {
      if (!confirmDiscardPrompt(closeResult.prompt)) {
        throw new Error("Tumblr's Discard post button is unavailable.");
      }
    }

    await waitFor(
      () => !findComposer(),
      10000,
      "Tumblr's reblog composer did not close."
    );
  }

  async function startRun() {
    if (state.running || state.selected.size < 2) return;
    const communities = [...state.selected.values()];
    const names = communities.map((community) => `• ${community.name}`).join("\n");
    const approved = window.confirm(
      `Reblog this post to ${communities.length} Communities?\n\n${names}\n\n` +
      "Tumblr will process them one at a time after this confirmation."
    );
    if (!approved) return;

    try {
      const response = await chrome.runtime.sendMessage({
        type: "tmr-start-background",
        url: location.href,
        communities
      });
      if (response?.started) {
        state.selected.clear();
        try {
          await closeCurrentComposer();
        } catch {
          // The background worker is independent of the original composer.
        }
        showBackgroundStarted(communities.length);
        return;
      }
      if (response?.busy) {
        window.alert("A Multi-Reblog batch is already running in the background.");
        return;
      }
    } catch {
      // If the background page is unavailable, retain the proven foreground
      // batch as a fallback.
    }

    state.running = true;
    const panel = showProgress(communities);
    let completed = 0;

    for (let index = 0; index < communities.length; index += 1) {
      const community = communities[index];
      setRow(panel, community.handle, "working");
      try {
        if (index > 0) {
          await reopenComposer();
          await openCommunityPicker();
        }
        await nativeSelectCommunity(community);
        await submitCurrentComposer(community);
        await closeCurrentComposer();
        setRow(panel, community.handle, "success");
      } catch (error) {
        setRow(panel, community.handle, "error", error.message);
        try {
          await closeCurrentComposer();
        } catch {
          // Continue so one broken composer does not hide all later results.
        }
      }
      completed += 1;
      setProgressCount(panel, completed, communities.length);
      if (index < communities.length - 1) await sleep(1200);
    }

    state.running = false;
    state.selected.clear();
    panel.classList.add("tmr-finished");
    const failures = panel.querySelectorAll('[data-status="error"]').length;
    panel.querySelector(".tmr-progress-count").textContent =
      failures ? `Finished with ${failures} failed` : "All reblogs complete";
    setTimeout(() => panel.remove(), failures ? 15000 : 6000);
  }

  function showBackgroundStarted(total) {
    document.querySelector(".tmr-background-started")?.remove();
    const notice = createElement("section", "tmr-background-started");
    notice.append(
      createElement(
        "strong",
        "",
        "Multi-Reblog is running in the background"
      ),
      createElement(
        "span",
        "",
        `0 of ${total} complete · Check the toolbar badge for progress.`
      )
    );
    document.body.append(notice);
    setTimeout(() => notice.remove(), 7000);
  }

  async function runWorkerBatch(message) {
    if (state.running) return;
    state.running = true;
    state.sourcePermalink = null;
    const communities = message.communities || [];
    let completed = 0;
    let failures = 0;

    try {
      captureSourcePermalink();
      await openCommunityPicker();

      for (let index = 0; index < communities.length; index += 1) {
        const community = communities[index];
        let error = null;
        try {
          if (index > 0) {
            await reopenComposer();
            await openCommunityPicker();
          }
          await nativeSelectCommunity(community);
          await submitCurrentComposer(community);
          await closeCurrentComposer();
        } catch (caught) {
          error = caught instanceof Error ? caught.message : String(caught);
          failures += 1;
          try {
            await closeCurrentComposer();
          } catch {
            // Continue with the remaining destinations.
          }
        }

        completed += 1;
        await chrome.runtime.sendMessage({
          type: "tmr-worker-progress",
          jobId: message.jobId,
          completed,
          total: communities.length,
          failures,
          community: community.name,
          error
        });
        if (index < communities.length - 1) await sleep(1600);
      }
    } catch (caught) {
      failures += Math.max(1, communities.length - completed);
      await chrome.runtime.sendMessage({
        type: "tmr-worker-error",
        jobId: message.jobId,
        error: caught instanceof Error ? caught.message : String(caught)
      });
    } finally {
      state.running = false;
      await chrome.runtime.sendMessage({
        type: "tmr-worker-done",
        jobId: message.jobId,
        completed,
        total: communities.length,
        failures
      });
    }
  }

  async function runWorkerItem(message) {
    if (state.running) return;
    state.running = true;
    let error = null;

    try {
      state.sourcePermalink = null;
      captureSourcePermalink();
      await openCommunityPicker();
      await nativeSelectCommunity(message.community);
      await submitCurrentComposer(message.community, message);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    } finally {
      state.running = false;
      await chrome.runtime.sendMessage({
        type: "tmr-worker-item-done",
        jobId: message.jobId,
        itemIndex: message.itemIndex,
        community: message.community.name,
        error
      });
    }
  }

  function checkForCommunityPicker() {
    let picker = findCommunityPicker();
    if (!picker) {
      const communityButton = [...document.querySelectorAll("button")]
        .find((button) => visible(button) && /@@[a-z0-9-]+/i.test(text(button)));
      picker = communityButton?.closest('[role="dialog"]') ||
        communityButton?.parentElement?.parentElement ||
        null;
    }
    if (picker) updatePicker(picker);
  }

  // Tumblr's dashboard changes continuously. A broad MutationObserver here can
  // feed back on the controls this extension adds and overwhelm Firefox.
  // A small periodic check is predictable and cheap, and the picker is updated
  // immediately after each user selection as well.
  checkForCommunityPicker();
  setInterval(checkForCommunityPicker, 750);
  showReadyNotice();

  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === "tmr-probe-composer") {
        return Promise.resolve({ composerReady: Boolean(findComposer()) });
      }
      if (message?.type === "tmr-run-worker-item") {
        runWorkerItem(message);
        return Promise.resolve({ accepted: true });
      }
      if (message?.type === "tmr-run-worker") {
        runWorkerBatch(message);
        return Promise.resolve({ accepted: true });
      }
      if (message?.type !== "tmr-status") return undefined;
      return Promise.resolve({
        loaded: true,
        pickerDetected: Boolean(findCommunityPicker()),
        communityCount: getCommunityButtons().length
      });
    });
    chrome.runtime.sendMessage({ type: "tmr-content-ready" }).catch(() => {});
  }
})();
