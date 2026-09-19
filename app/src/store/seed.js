import { uid } from "../lib/id.js";

// Sample content so a first run looks like a deck in use rather than a void.
// Every date is relative to "now", so the demo never looks stale.

const iso = (offsetDays = 0, hour = 9) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

const key = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, "0")}`;
};

const columns = () => [
  { id: "todo", name: "To Do" },
  { id: "doing", name: "In Progress" },
  { id: "review", name: "In Review" },
  { id: "done", name: "Done", isDone: true },
];

export function buildSeed() {
  const catWork = uid("c");
  const catPersonal = uid("c");
  const catStudy = uid("c");

  const pDeck = uid("p");
  const pSite = uid("p");
  const pHome = uid("p");
  const pCourse = uid("p");

  const task = (partial, index) => ({
    id: uid("t"),
    title: "",
    notes: "",
    projectId: null,
    status: "todo",
    priority: "none",
    due: null,
    time: null,
    tags: [],
    subtasks: [],
    comments: [],
    links: [],
    order: index * 100,
    createdAt: iso(-3),
    completedAt: null,
    starred: false,
    archived: false,
    ...partial,
  });

  const sub = (title, done = false) => ({ id: uid("s"), title, done });

  const tasks = [
    {
      title: "Plan the week and clear the inbox",
      notes: "Fifteen minutes, every Monday. Sort anything loose into a project or drop it.",
      projectId: pDeck, status: "doing", priority: "medium", due: key(0), time: "09:00",
      tags: ["ritual"],
      subtasks: [sub("Empty the inbox", true), sub("Pick three focus tasks", true), sub("Block deep work time")],
    },
    {
      title: "Finish the onboarding flow copy",
      notes: "Second pass on the empty states — they still read like placeholders.",
      projectId: pDeck, status: "doing", priority: "high", due: key(1),
      tags: ["writing"],
      subtasks: [sub("Welcome screen", true), sub("Empty states"), sub("Tooltips")],
      comments: [{ id: uid("cm"), body: "Keep it to one sentence per state.", at: iso(-1, 14) }],
    },
    {
      title: "Review the component library spacing scale",
      projectId: pDeck, status: "review", priority: "low", due: key(3),
      tags: ["design"],
      subtasks: [sub("Audit paddings", true), sub("Write the token doc", true)],
    },
    {
      title: "Ship the dark theme pass",
      projectId: pDeck, status: "done", priority: "medium", due: key(-2),
      completedAt: iso(-2, 17), tags: ["design"],
    },
    {
      title: "Draft the quarterly note",
      notes: "Where the last three months actually went, not where they were meant to go.",
      projectId: pDeck, status: "todo", priority: "medium", due: key(4),
    },
    {
      title: "Rewrite the landing page hero",
      projectId: pSite, status: "todo", priority: "high", due: key(2), tags: ["writing"],
      subtasks: [sub("Three headline options"), sub("Pick one")],
    },
    {
      title: "Compress the hero images",
      projectId: pSite, status: "todo", priority: "low", due: key(6),
    },
    {
      title: "Set up analytics without the creepy bits",
      projectId: pSite, status: "doing", priority: "medium", due: key(5),
    },
    {
      title: "Book the boiler service",
      projectId: pHome, status: "todo", priority: "high", due: key(-1), tags: ["errand"],
    },
    {
      title: "Replace the hallway bulbs",
      projectId: pHome, status: "todo", priority: "low", due: key(8), tags: ["errand"],
    },
    {
      title: "Meal plan for the week",
      projectId: pHome, status: "done", priority: "none", due: key(0),
      completedAt: iso(0, 8),
    },
    {
      title: "Watch lecture 4 and take notes",
      projectId: pCourse, status: "doing", priority: "medium", due: key(0), time: "19:30",
      subtasks: [sub("Watch", true), sub("Summarise in own words")],
    },
    {
      title: "Problem set 3",
      projectId: pCourse, status: "todo", priority: "high", due: key(2),
    },
    {
      title: "Reply to Sam about the workshop",
      projectId: null, status: "todo", priority: "medium", due: key(0), tags: ["inbox"],
    },
    {
      title: "Back up the photo library",
      projectId: null, status: "todo", priority: "low", due: null, tags: ["someday"],
    },
  ].map(task);

  const journalFields = [
    { id: "f_date", name: "Date", type: "date", primary: false },
    { id: "f_entry", name: "Entry", type: "longtext" },
    {
      id: "f_mood", name: "Mood", type: "select",
      options: [
        { id: "great", name: "Great", color: "#7ee08a" },
        { id: "good", name: "Good", color: "#c7f051" },
        { id: "okay", name: "Okay", color: "#e8c35a" },
        { id: "low", name: "Low", color: "#7fb2f0" },
        { id: "rough", name: "Rough", color: "#ef7d7d" },
      ],
    },
    { id: "f_win", name: "One good thing", type: "text" },
    { id: "f_tags", name: "Tags", type: "tags" },
  ];

  const readingFields = [
    { id: "r_title", name: "Title", type: "text", primary: true },
    { id: "r_author", name: "Author", type: "text" },
    {
      id: "r_status", name: "Status", type: "select",
      options: [
        { id: "want", name: "Want to read", color: "#7fb2f0" },
        { id: "reading", name: "Reading", color: "#c7f051" },
        { id: "finished", name: "Finished", color: "#7ee08a" },
        { id: "parked", name: "Parked", color: "#8b929c" },
      ],
    },
    { id: "r_rating", name: "Rating", type: "rating" },
    { id: "r_pages", name: "Pages", type: "number" },
    { id: "r_link", name: "Link", type: "url" },
    { id: "r_notes", name: "Notes", type: "longtext" },
    { id: "r_started", name: "Started", type: "date" },
  ];

  const record = (values) => ({
    id: uid("r"), values, createdAt: iso(-5), updatedAt: iso(-1),
  });

  const pages = [
    {
      id: uid("pg"),
      name: "Journal",
      icon: "book",
      template: "journal",
      description: "One entry a day. Short is fine.",
      fields: journalFields,
      views: [
        { id: uid("v"), name: "Timeline", type: "list", sortBy: "f_date", sortDir: "desc" },
        { id: uid("v"), name: "By mood", type: "board", groupBy: "f_mood" },
        { id: uid("v"), name: "Table", type: "table" },
      ],
      records: [
        record({
          f_date: key(0),
          f_entry: "Slow start, then a good three-hour block on the onboarding copy. The trick was closing the board and only keeping one task open.",
          f_mood: "good", f_win: "Three uninterrupted hours", f_tags: ["focus"],
        }),
        record({
          f_date: key(-1),
          f_entry: "Too much context switching. Ended the day with a long list and not much finished. Worth capping the board at three in-progress cards.",
          f_mood: "okay", f_win: "Walked at lunch", f_tags: ["admin"],
        }),
        record({
          f_date: key(-2),
          f_entry: "Shipped the dark theme pass. Small thing, but it has been sitting there for two weeks and it feels lighter now it is gone.",
          f_mood: "great", f_win: "Shipped something", f_tags: ["ship"],
        }),
      ],
      createdAt: iso(-20),
    },
    {
      id: uid("pg"),
      name: "Reading list",
      icon: "book-open",
      template: "reading",
      description: "What is queued, what is open, what stuck.",
      fields: readingFields,
      views: [
        { id: uid("v"), name: "Shelf", type: "board", groupBy: "r_status" },
        { id: uid("v"), name: "Gallery", type: "gallery" },
        { id: uid("v"), name: "Table", type: "table" },
      ],
      records: [
        record({ r_title: "Thinking in Systems", r_author: "Donella Meadows", r_status: "reading", r_pages: 240, r_started: key(-9), r_notes: "Stocks and flows chapter is worth re-reading." }),
        record({ r_title: "The Shallows", r_author: "Nicholas Carr", r_status: "want", r_pages: 288 }),
        record({ r_title: "Deep Work", r_author: "Cal Newport", r_status: "finished", r_rating: 4, r_pages: 304, r_started: key(-60), r_notes: "The scheduling half is the useful half." }),
        record({ r_title: "Four Thousand Weeks", r_author: "Oliver Burkeman", r_status: "finished", r_rating: 5, r_pages: 288, r_notes: "Best argument against the productivity treadmill, in a productivity book." }),
        record({ r_title: "A Pattern Language", r_author: "Christopher Alexander", r_status: "parked", r_pages: 1171, r_notes: "Beautiful, enormous. Dip in rather than read through." }),
      ],
      createdAt: iso(-20),
    },
  ];

  const habitLog = (density, days = 80) => {
    const log = {};
    for (let i = 0; i < days; i += 1) {
      if (Math.random() < density) log[key(-i)] = true;
    }
    return log;
  };

  const habits = [
    { id: uid("h"), name: "Move for 30 minutes", color: "#c7f051", icon: "flame", target: 5, log: { ...habitLog(0.7), [key(0)]: true }, createdAt: iso(-90), archived: false },
    { id: uid("h"), name: "Read 20 pages", color: "#7fb2f0", icon: "book", target: 7, log: habitLog(0.55), createdAt: iso(-90), archived: false },
    { id: uid("h"), name: "No screens after 10pm", color: "#e8c35a", icon: "moon", target: 5, log: habitLog(0.4), createdAt: iso(-90), archived: false },
    { id: uid("h"), name: "Journal", color: "#7ee08a", icon: "note", target: 7, log: { ...habitLog(0.6), [key(0)]: true }, createdAt: iso(-90), archived: false },
  ];

  const notes = [
    {
      id: uid("n"), title: "Weekly review questions",
      body: "1. What actually moved this week?\n2. What did I keep pushing forward, and why?\n3. What can be deleted rather than deferred?\n4. What is the one thing next week turns on?",
      tags: ["ritual"], pinned: true, createdAt: iso(-14), updatedAt: iso(-2),
    },
    {
      id: uid("n"), title: "Ideas parking lot",
      body: "— A page template for trip planning\n— Weekly email digest of what got done\n— Keyboard-only mode\n— Export a project as a single markdown file",
      tags: ["ideas"], pinned: false, createdAt: iso(-10), updatedAt: iso(-1),
    },
    {
      id: uid("n"), title: "Focus rules that hold",
      body: "Three in progress, maximum.\nOne browser window while a timer runs.\nIf a task has been carried three days, either book time for it or delete it.",
      tags: ["focus", "ritual"], pinned: false, createdAt: iso(-6), updatedAt: iso(-6),
    },
  ];

  const focusSessions = Array.from({ length: 14 }, (_, i) => ({
    id: uid("fs"),
    startedAt: iso(-i, 10 + (i % 6)),
    minutes: [25, 25, 50, 25, 45][i % 5],
    taskId: null,
    mode: "focus",
  }));

  return {
    version: 1,
    settings: {
      theme: "dark", accent: "lime", weekStart: 1, displayName: "",
      focusMinutes: 25, breakMinutes: 5, longBreakMinutes: 15,
      startPage: "#/today", confirmDelete: true, sidebarOpen: true, showCompleted: false,
    },
    categories: [
      { id: catWork, name: "Work", color: "#c7f051" },
      { id: catPersonal, name: "Personal", color: "#7fb2f0" },
      { id: catStudy, name: "Study", color: "#e8c35a" },
    ],
    projects: [
      { id: pDeck, name: "Dezk – product", color: "#c7f051", categoryId: catWork, favorite: true, archived: false, description: "The deck itself: design, copy, shipping.", columns: columns(), createdAt: iso(-30) },
      { id: pSite, name: "Personal site", color: "#7fb2f0", categoryId: catWork, favorite: true, archived: false, description: "Rebuild, then stop fiddling with it.", columns: columns(), createdAt: iso(-25) },
      { id: pHome, name: "Home & errands", color: "#e8c35a", categoryId: catPersonal, favorite: false, archived: false, description: "", columns: columns(), createdAt: iso(-40) },
      { id: pCourse, name: "Systems course", color: "#ef7d7d", categoryId: catStudy, favorite: false, archived: false, description: "Twelve weeks, one lecture at a time.", columns: columns(), createdAt: iso(-15) },
    ],
    tasks,
    habits,
    notes,
    pages,
    focus: { sessions: focusSessions },
    meta: { createdAt: new Date().toISOString(), lastOpened: null, seeded: true },
  };
}
