import { store } from "../store/state.js";
import { logFocusSession } from "../store/actions.js";
import { toast } from "./toast.js";

// A pomodoro-style focus clock. Kept outside view code so it survives navigation.

const listeners = new Set();
let interval = null;

export const timer = {
  mode: "focus",
  running: false,
  remaining: store.state.settings.focusMinutes * 60,
  total: store.state.settings.focusMinutes * 60,
  taskId: null,
  completedRounds: 0,
};

function emit() { for (const listener of [...listeners]) listener(timer); }
export function onTimer(listener) { listeners.add(listener); return () => listeners.delete(listener); }

function minutesFor(mode) {
  const settings = store.state.settings;
  if (mode === "break") return settings.breakMinutes || 5;
  if (mode === "longBreak") return settings.longBreakMinutes || 15;
  return settings.focusMinutes || 25;
}

export function setMode(mode, { keepRunning = false } = {}) {
  timer.mode = mode;
  timer.total = minutesFor(mode) * 60;
  timer.remaining = timer.total;
  if (!keepRunning) pause();
  emit();
}

export function start(taskId = null) {
  if (taskId !== null) timer.taskId = taskId;
  if (timer.running) return;
  timer.running = true;
  interval = setInterval(tick, 1000);
  emit();
}

export function pause() {
  timer.running = false;
  clearInterval(interval);
  interval = null;
  emit();
}

export function toggle(taskId = null) {
  if (timer.running) pause();
  else start(taskId);
}

export function reset() {
  timer.total = minutesFor(timer.mode) * 60;
  timer.remaining = timer.total;
  pause();
}

export function setTask(taskId) { timer.taskId = taskId; emit(); }

function tick() {
  timer.remaining -= 1;
  if (timer.remaining <= 0) finish();
  else emit();
}

function finish() {
  const wasFocus = timer.mode === "focus";
  const minutes = Math.round(timer.total / 60);
  pause();
  if (wasFocus) {
    timer.completedRounds += 1;
    logFocusSession({ minutes, taskId: timer.taskId, mode: "focus" });
  }
  notify(wasFocus ? `Focus block done — ${minutes} minutes logged.` : "Break over. Back to it.");
  const next = wasFocus ? (timer.completedRounds % 4 === 0 ? "longBreak" : "break") : "focus";
  setMode(next);
}

function notify(message) {
  toast(message);
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification("Dezk", { body: message });
    }
  } catch { /* notifications are a bonus, never a requirement */ }
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.62);
    setTimeout(() => ctx.close(), 900);
  } catch { /* audio is optional too */ }
}

/** Keep an idle timer in step with a changed duration setting. */
store.subscribe(() => {
  if (timer.running) return;
  const total = minutesFor(timer.mode) * 60;
  if (total !== timer.total) {
    timer.total = total;
    timer.remaining = total;
    emit();
  }
});
