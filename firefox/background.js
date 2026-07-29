// SPDX-License-Identifier: MPL-2.0
"use strict";

const MAX_ATTEMPTS = 3;
const MIN_POST_CONFIRMATION_MS = 5000;
const BETWEEN_COMMUNITIES_MS = 3000;
const jobsByTab = new Map();
let nextJobId = 1;

function badge(text, color = "#00b8ff") {
  browser.browserAction.setBadgeBackgroundColor({ color });
  browser.browserAction.setBadgeText({ text });
}

function resultList(job) {
  return job.communities.map((community) => {
    const result = job.results.get(community.handle);
    return {
      handle: community.handle,
      name: community.name,
      status: result.status,
      attempts: result.attempts,
      error: result.error || null
    };
  });
}

async function saveStatus(job, state = "running") {
  await browser.storage.local.set({
    tmrLastBatch: {
      jobId: job.id,
      state,
      total: job.communities.length,
      settled: job.settled,
      successes: job.successes,
      failures: job.failures,
      updatedAt: Date.now(),
      results: resultList(job)
    }
  });
}

function scheduleComposerProbe(tabId, delay = 500) {
  setTimeout(() => probeComposer(tabId), delay);
}

async function dispatchWorker(tabId) {
  const job = jobsByTab.get(tabId);
  if (!job || job.dispatched || job.completingItem) return;

  if (!job.current) {
    job.current = job.queue.shift() || null;
  }
  if (!job.current) return;

  job.current.attempts += 1;
  job.current.token = ++job.nextToken;
  job.current.confirmAfter = Date.now() + MIN_POST_CONFIRMATION_MS;
  job.current.destinationConfirmed = false;
  job.dispatched = true;
  const saved = job.results.get(job.current.community.handle);
  saved.status = job.current.attempts > 1 ? "retrying" : "posting";
  saved.attempts = job.current.attempts;
  saved.error = null;
  await saveStatus(job);

  try {
    const response = await browser.tabs.sendMessage(tabId, {
      type: "tmr-run-worker-item",
      jobId: job.id,
      itemIndex: job.current.token,
      community: job.current.community
    });
    if (!response?.accepted) job.dispatched = false;
  } catch {
    job.dispatched = false;
    scheduleComposerProbe(tabId, 700);
  }
}

async function probeComposer(tabId) {
  const job = jobsByTab.get(tabId);
  if (!job || job.dispatched || job.completingItem) return;
  job.probeAttempts += 1;

  try {
    const result = await browser.tabs.sendMessage(tabId, {
      type: "tmr-probe-composer"
    });
    if (result?.composerReady) {
      if (job.workerWasActivated) {
        await browser.tabs.update(job.ownerTabId, { active: true }).catch(() => {});
        job.workerWasActivated = false;
      }
      dispatchWorker(tabId);
      return;
    }
  } catch {
    // Tumblr or the extension content script is not ready yet.
  }

  if (job.probeAttempts === 8) {
    await browser.tabs.update(tabId, { active: true }).catch(() => {});
    job.workerWasActivated = true;
  }

  if (job.probeAttempts < 40) {
    scheduleComposerProbe(tabId);
    return;
  }

  // A page that never produces a composer is a failed attempt. It enters the
  // same retry queue as any other Community-level failure.
  if (!job.current) job.current = job.queue.shift() || null;
  if (job.current) {
    job.current.attempts += 1;
    job.current.token = ++job.nextToken;
    await completeWorkerItem(
      tabId,
      job.current.token,
      "Tumblr did not load the reblog composer."
    );
  } else {
    await finishJob(tabId, job);
  }
}

async function finishJob(tabId, job) {
  if (job.workerWasActivated) {
    await browser.tabs.update(job.ownerTabId, { active: true }).catch(() => {});
    job.workerWasActivated = false;
  }

  await saveStatus(job, job.failures ? "finished_with_errors" : "complete");
  const title = job.failures
    ? "Multi-Reblog finished with errors"
    : "Multi-Reblog complete";
  const message = `${job.successes} succeeded · ${job.failures} failed`;

  badge(job.failures ? "!" : "✓", job.failures ? "#ff4930" : "#00cf35");
  await browser.notifications.create(`tmr-${job.id}`, {
    type: "basic",
    iconUrl: browser.runtime.getURL("icons/icon-96.svg"),
    title,
    message
  });

  jobsByTab.delete(tabId);
  setTimeout(() => browser.tabs.remove(tabId).catch(() => {}), 2200);
}

async function loadNextAttempt(workerTabId, job) {
  job.probeAttempts = 0;
  job.completingItem = false;
  job.dispatched = false;
  await browser.tabs.update(workerTabId, { url: job.url });
  scheduleComposerProbe(workerTabId, 700);
}

async function completeWorkerItem(workerTabId, token, error = null) {
  const job = jobsByTab.get(workerTabId);
  if (!job || job.completingItem || !job.current ||
      token !== job.current.token) return;

  if (!error && Date.now() < job.current.confirmAfter) {
    if (!job.confirmationTimer) {
      job.confirmationTimer = setTimeout(() => {
        job.confirmationTimer = null;
        completeWorkerItem(workerTabId, token, null);
      }, job.current.confirmAfter - Date.now());
    }
    return;
  }

  job.completingItem = true;
  const attempt = job.current;
  const saved = job.results.get(attempt.community.handle);

  if (!error) {
    saved.status = "posted";
    saved.attempts = attempt.attempts;
    saved.error = null;
    job.successes += 1;
    job.settled += 1;
  } else if (attempt.attempts < MAX_ATTEMPTS) {
    saved.status = "retrying";
    saved.attempts = attempt.attempts;
    saved.error = error;
    job.queue.push(attempt);
  } else {
    saved.status = "failed";
    saved.attempts = attempt.attempts;
    saved.error = error;
    job.failures += 1;
    job.settled += 1;
  }

  job.current = null;
  await saveStatus(job);
  badge(`${job.settled}/${job.communities.length}`,
    job.failures ? "#ff9f1c" : "#00b8ff");

  if (job.settled >= job.communities.length) {
    await finishJob(workerTabId, job);
  } else {
    setTimeout(() => loadNextAttempt(workerTabId, job), BETWEEN_COMMUNITIES_MS);
  }
}

browser.runtime.onMessage.addListener(async (message, sender) => {
  if (message?.type === "tmr-start-background") {
    if (jobsByTab.size > 0) return { started: false, busy: true };
    const ownerTabId = sender.tab?.id;
    if (!ownerTabId || !message.url || !message.communities?.length) {
      return { started: false };
    }

    const results = new Map(message.communities.map((community) => [
      community.handle,
      { status: "pending", attempts: 0, error: null }
    ]));
    const job = {
      id: nextJobId++,
      ownerTabId,
      communities: message.communities,
      url: message.url,
      queue: message.communities.map((community) => ({
        community,
        attempts: 0,
        token: 0
      })),
      current: null,
      nextToken: 0,
      results,
      settled: 0,
      successes: 0,
      failures: 0,
      probeAttempts: 0,
      workerWasActivated: false,
      completingItem: false,
      dispatched: false
    };

    const workerTab = await browser.tabs.create({
      url: message.url,
      active: false
    });
    jobsByTab.set(workerTab.id, job);
    await saveStatus(job);
    badge(`0/${job.communities.length}`);
    scheduleComposerProbe(workerTab.id, 700);
    return { started: true, jobId: job.id };
  }

  if (message?.type === "tmr-get-batch-status") {
    const stored = await browser.storage.local.get("tmrLastBatch");
    return stored.tmrLastBatch || null;
  }

  const workerTabId = sender.tab?.id;
  const job = jobsByTab.get(workerTabId);
  if (message?.type === "tmr-content-ready" && job) {
    scheduleComposerProbe(workerTabId, 150);
    return { ok: true, worker: true };
  }
  if (!job || message.jobId !== job.id) return undefined;

  if (message.type === "tmr-worker-destination-confirmed" &&
      job.current && message.itemIndex === job.current.token &&
      message.handle === job.current.community.handle) {
    job.current.destinationConfirmed = true;
    return { ok: true };
  }

  if (message.type === "tmr-worker-item-done") {
    await completeWorkerItem(
      workerTabId,
      message.itemIndex,
      message.error || null
    );
    return { ok: true };
  }
  return undefined;
});

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  const job = jobsByTab.get(tabId);
  if (!job) return;

  if (job.dispatched && job.current?.destinationConfirmed && changeInfo.url) {
    try {
      const path = new URL(changeInfo.url).pathname;
      if (!path.startsWith("/reblog/")) {
        completeWorkerItem(tabId, job.current.token, null);
        return;
      }
    } catch {
      // Ignore malformed transitional URLs.
    }
  }

  if (changeInfo.status === "complete") {
    scheduleComposerProbe(tabId, 150);
  }
});

browser.tabs.onRemoved.addListener(async (tabId) => {
  const job = jobsByTab.get(tabId);
  if (!job) return;

  for (const result of job.results.values()) {
    if (!["posted", "failed"].includes(result.status)) {
      result.status = "failed";
      result.error = "The background worker tab was closed.";
      job.failures += 1;
      job.settled += 1;
    }
  }
  jobsByTab.delete(tabId);
  await saveStatus(job, "interrupted");
  badge("!", "#ff4930");
});
