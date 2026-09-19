import { h } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { store } from "../store/state.js";
import { sync, onSync, run as runSync, connect, disconnect, adoptServerCopy, uploadEverything, isConnected } from "../store/sync.js";
import { openModal, closeTopModal, confirmDialog } from "./modal.js";
import { toast } from "./toast.js";
import { relativeTime } from "../lib/date.js";

const TONE = {
  off: { icon: "globe", label: "Not syncing", color: "var(--ink-3)" },
  idle: { icon: "check-circle", label: "Synced", color: "var(--accent)" },
  syncing: { icon: "reset", label: "Syncing…", color: "var(--accent)" },
  offline: { icon: "alert", label: "Offline", color: "hsl(var(--hue-medium) 85% 62%)" },
  error: { icon: "alert", label: "Sync problem", color: "hsl(var(--hue-high) 80% 66%)" },
};

/** The small live pill in the sidebar. It updates itself, outside the render loop. */
export function syncPill() {
  const node = h("button", {
    class: "syncpill",
    onClick: () => (isConnected() ? runSync() : openSyncDialog()),
  });

  const paint = () => {
    const tone = TONE[sync.status] || TONE.off;
    const pending = sync.pending;
    let label = tone.label;
    if (sync.status === "idle" && pending) label = `${pending} to send`;
    else if (sync.status === "idle" && sync.lastSyncedAt) label = `Synced ${relativeTime(sync.lastSyncedAt)}`;
    else if (sync.status === "offline" && pending) label = `${pending} queued`;

    node.title = sync.status === "off" ? "Set up syncing across your devices" : sync.message || label;
    node.dataset.status = sync.status;
    // replaceChildren does not skip nulls the way h() does.
    const children = [
      h("span", { class: "syncpill__dot", style: { background: tone.color } }),
      h("span", { class: "u-truncate" }, label),
    ];
    if (sync.status === "off") children.push(icon("chevron-right", 13));
    node.replaceChildren(...children);
  };

  paint();
  const stop = onSync(() => (node.isConnected ? paint() : stop()));
  return node;
}

/* ---------------- the connect dialog ---------------- */

export function openSyncDialog() {
  const state = store.state;
  const connected = isConnected();

  const urlInput = h("input", {
    class: "input", value: state.sync.url || "", placeholder: "https://dezk.your-name.workers.dev",
    autocomplete: "url", spellcheck: "false",
  });
  const passInput = h("input", {
    class: "input", type: "password", placeholder: connected ? "Only needed to sign in again" : "Your passphrase",
    autocomplete: "current-password",
  });
  const nameInput = h("input", {
    class: "input", value: state.sync.deviceName || "", placeholder: "This laptop, My phone…",
  });
  const status = h("p", { class: "field__hint" });

  const say = (message, tone = "") => {
    status.textContent = message;
    status.style.color = tone === "bad" ? "hsl(var(--hue-high) 80% 66%)" : tone === "good" ? "var(--accent)" : "";
  };

  const submit = async (button) => {
    const url = urlInput.value.trim();
    const passphrase = passInput.value;
    if (!url || !passphrase) { say("Both the address and the passphrase are needed.", "bad"); return; }
    button.disabled = true;
    say("Connecting…");
    try {
      const { serverHasData } = await connect(url, passphrase, { deviceName: nameInput.value.trim() });
      const localIsSample = store.state.meta.seeded;
      closeTopModal();

      if (serverHasData && localIsSample) {
        // Nothing here but the demo content, so take the server's copy.
        await adoptServerCopy();
        toast("Connected — pulled your data from the server");
        return;
      }
      if (serverHasData) {
        confirmDialog({
          title: "The server already has data",
          message: "Merge what is on this device into it, keeping the newer version of anything that exists in both? Nothing is deleted. Choose 'Replace' instead to discard this device's copy and take the server's.",
          confirmLabel: "Merge",
          danger: false,
          onConfirm: async () => { await uploadEverything(); toast("Connected and merged"); },
        });
        return;
      }
      await uploadEverything();
      toast("Connected — this device's data is now on the server");
    } catch (error) {
      button.disabled = false;
      say(error.message, "bad");
    }
  };

  const connectButton = h("button", { class: "btn btn--primary", onClick: (event) => submit(event.currentTarget) }, connected ? "Sign in again" : "Connect");

  openModal({
    title: connected ? "Syncing" : "Sync across your devices",
    body: [
      h("p", { class: "u-muted", style: { fontSize: "13px", lineHeight: "1.6" } },
        connected
          ? "This device is talking to your own server. Open the same address on your phone, enter the same passphrase, and they stay in step."
          : "Dezk keeps your data in this browser. Point it at your own sync server — a free Cloudflare Worker, set up once — and every device you sign in on stays in step. See server/README.md for the five commands."),
      h("label", { class: "field" }, h("span", { class: "field__label" }, "Server address"), urlInput),
      h("label", { class: "field" }, h("span", { class: "field__label" }, "Passphrase"), passInput),
      h("label", { class: "field" }, h("span", { class: "field__label" }, "Name this device"), nameInput,
        h("span", { class: "field__hint" }, "Only used to tell your devices apart.")),
      status,
    ],
    footer: [
      connected
        ? h("button", {
            class: "btn btn--danger",
            onClick: () => {
              closeTopModal();
              confirmDialog({
                title: "Stop syncing on this device?",
                message: "Your data stays here and stays on the server. This device simply stops talking to it.",
                confirmLabel: "Stop syncing",
                onConfirm: () => { disconnect(); toast("Syncing stopped on this device"); },
              });
            },
          }, "Disconnect")
        : null,
      h("div", { class: "u-grow" }),
      h("button", { class: "btn", onClick: () => closeTopModal() }, "Cancel"),
      connectButton,
    ],
    initialFocus: "input",
  });

  passInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); submit(connectButton); }
  });
}

/* ---------------- the settings panel ---------------- */

export function syncSettingsRows() {
  const state = store.state;
  const connected = isConnected();
  const tone = TONE[sync.status] || TONE.off;

  const row = (title, description, control) =>
    h("div", { class: "settings-row" },
      h("div", { class: "settings-row__text" },
        h("div", { class: "settings-row__title" }, title),
        description ? h("div", { class: "settings-row__desc" }, description) : null),
      control);

  return h(
    "div", null,
    h(
      "div", { class: "u-row", style: { gap: "10px", paddingBottom: "10px" } },
      h("span", { class: "dot", style: { background: tone.color } }),
      h("div", { class: "u-col u-grow", style: { gap: "2px" } },
        h("span", { style: { fontSize: "13.5px", fontWeight: "560" } },
          connected ? `Syncing with ${new URL(state.sync.url).host}` : "Not syncing"),
        h("span", { class: "u-dim", style: { fontSize: "12.5px" } },
          connected
            ? `${state.sync.deviceName || "This device"} · ${sync.pending ? `${sync.pending} change${sync.pending === 1 ? "" : "s"} waiting` : "everything sent"}${state.sync.lastSyncedAt ? ` · last synced ${relativeTime(state.sync.lastSyncedAt)}` : ""}`
            : "Your data is only in this browser. Connect a server to share it with your other devices.")),
    ),
    state.sync.lastError && connected
      ? h("p", { class: "field__hint", style: { color: "hsl(var(--hue-high) 80% 66%)", paddingBottom: "8px" } }, state.sync.lastError)
      : null,
    row(
      connected ? "Connection" : "Set up syncing",
      connected ? "Change the address, sign in again, or stop syncing here." : "Takes one free Cloudflare Worker — see server/README.md.",
      h("button", { class: connected ? "btn btn--sm" : "btn btn--primary btn--sm", onClick: () => openSyncDialog() },
        icon("globe", 14), connected ? "Manage" : "Connect")
    ),
    connected
      ? row("Sync now", "Runs automatically after every change, on reconnect, and once a minute.",
          h("button", { class: "btn btn--sm", onClick: () => runSync().then(() => toast(sync.message || "Synced")) }, icon("reset", 14), "Sync"))
      : null,
    connected
      ? row("Re-upload everything", "Sends every item again. Useful if a device fell badly behind.",
          h("button", { class: "btn btn--sm", onClick: () => uploadEverything().then(() => toast("Everything queued for upload")) }, icon("upload", 14), "Re-upload"))
      : null,
    connected
      ? row("Take the server's copy", "Discards what is on this device and pulls the server's version.",
          h("button", {
            class: "btn btn--sm btn--danger",
            onClick: () => confirmDialog({
              title: "Replace this device's data?",
              message: "Everything here is cleared and replaced by whatever is on the server. Anything on this device that has not been sent yet is lost.",
              confirmLabel: "Replace",
              onConfirm: () => adoptServerCopy().then(() => toast("Pulled the server's copy")),
            }),
          }, icon("download", 14), "Replace"))
      : null
  );
}
