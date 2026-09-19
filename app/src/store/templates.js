import { uid } from "../lib/id.js";

// Page templates. A "page" is a small database: fields + views + records,
// which is how Journal, Reading list and anything you invent all work.

const opt = (id, name, color) => ({ id, name, color });

export const FIELD_TYPES = [
  { id: "text", name: "Text", icon: "text" },
  { id: "longtext", name: "Long text", icon: "note" },
  { id: "number", name: "Number", icon: "hash" },
  { id: "select", name: "Select", icon: "list" },
  { id: "tags", name: "Tags", icon: "tag" },
  { id: "date", name: "Date", icon: "calendar" },
  { id: "checkbox", name: "Checkbox", icon: "check-square" },
  { id: "rating", name: "Rating", icon: "star" },
  { id: "url", name: "Link", icon: "link" },
];

export const VIEW_TYPES = [
  { id: "table", name: "Table", icon: "table" },
  { id: "board", name: "Board", icon: "board" },
  { id: "gallery", name: "Gallery", icon: "grid" },
  { id: "list", name: "List", icon: "list" },
];

export const TEMPLATES = [
  {
    id: "custom",
    name: "Blank page",
    icon: "note",
    blurb: "Start from nothing: a title, a note and whatever fields you add.",
    build: () => ({
      fields: [
        { id: uid("f"), name: "Name", type: "text", primary: true },
        { id: uid("f"), name: "Notes", type: "longtext" },
        { id: uid("f"), name: "Tags", type: "tags" },
      ],
      views: [{ id: uid("v"), name: "All", type: "table" }],
      records: [],
    }),
  },
  {
    id: "journal",
    name: "Journal",
    icon: "book",
    blurb: "A dated entry with a mood and one good thing. Timeline view.",
    build: () => {
      const date = uid("f");
      const mood = uid("f");
      return {
        fields: [
          { id: date, name: "Date", type: "date" },
          { id: uid("f"), name: "Entry", type: "longtext" },
          {
            id: mood, name: "Mood", type: "select",
            options: [opt("great", "Great", "#7ee08a"), opt("good", "Good", "#c7f051"), opt("okay", "Okay", "#e8c35a"), opt("low", "Low", "#7fb2f0"), opt("rough", "Rough", "#ef7d7d")],
          },
          { id: uid("f"), name: "One good thing", type: "text" },
          { id: uid("f"), name: "Tags", type: "tags" },
        ],
        views: [
          { id: uid("v"), name: "Timeline", type: "list", sortBy: date, sortDir: "desc" },
          { id: uid("v"), name: "By mood", type: "board", groupBy: mood },
        ],
        records: [],
      };
    },
  },
  {
    id: "reading",
    name: "Reading list",
    icon: "book-open",
    blurb: "Books and articles with status, rating and notes. Shelf board.",
    build: () => {
      const status = uid("f");
      return {
        fields: [
          { id: uid("f"), name: "Title", type: "text", primary: true },
          { id: uid("f"), name: "Author", type: "text" },
          {
            id: status, name: "Status", type: "select",
            options: [opt("want", "Want to read", "#7fb2f0"), opt("reading", "Reading", "#c7f051"), opt("finished", "Finished", "#7ee08a"), opt("parked", "Parked", "#8b929c")],
          },
          { id: uid("f"), name: "Rating", type: "rating" },
          { id: uid("f"), name: "Pages", type: "number" },
          { id: uid("f"), name: "Link", type: "url" },
          { id: uid("f"), name: "Notes", type: "longtext" },
        ],
        views: [
          { id: uid("v"), name: "Shelf", type: "board", groupBy: status },
          { id: uid("v"), name: "Gallery", type: "gallery" },
          { id: uid("v"), name: "Table", type: "table" },
        ],
        records: [],
      };
    },
  },
  {
    id: "watchlist",
    name: "Watchlist",
    icon: "eye",
    blurb: "Films and series with where you are up to and what you thought.",
    build: () => {
      const status = uid("f");
      return {
        fields: [
          { id: uid("f"), name: "Title", type: "text", primary: true },
          {
            id: status, name: "Status", type: "select",
            options: [opt("queue", "Queued", "#7fb2f0"), opt("watching", "Watching", "#c7f051"), opt("seen", "Watched", "#7ee08a")],
          },
          { id: uid("f"), name: "Rating", type: "rating" },
          { id: uid("f"), name: "Where", type: "text" },
          { id: uid("f"), name: "Thoughts", type: "longtext" },
        ],
        views: [
          { id: uid("v"), name: "Board", type: "board", groupBy: status },
          { id: uid("v"), name: "Table", type: "table" },
        ],
        records: [],
      };
    },
  },
  {
    id: "goals",
    name: "Goals",
    icon: "target",
    blurb: "Outcomes with a horizon, a measure and a progress number.",
    build: () => {
      const horizon = uid("f");
      return {
        fields: [
          { id: uid("f"), name: "Goal", type: "text", primary: true },
          {
            id: horizon, name: "Horizon", type: "select",
            options: [opt("month", "This month", "#c7f051"), opt("quarter", "This quarter", "#7fb2f0"), opt("year", "This year", "#e8c35a"), opt("someday", "Someday", "#8b929c")],
          },
          { id: uid("f"), name: "Measure", type: "text" },
          { id: uid("f"), name: "Progress %", type: "number" },
          { id: uid("f"), name: "Why it matters", type: "longtext" },
          { id: uid("f"), name: "Review on", type: "date" },
        ],
        views: [
          { id: uid("v"), name: "By horizon", type: "board", groupBy: horizon },
          { id: uid("v"), name: "Table", type: "table" },
        ],
        records: [],
      };
    },
  },
  {
    id: "workouts",
    name: "Training log",
    icon: "flame",
    blurb: "Sessions with type, duration and how it felt.",
    build: () => {
      const kind = uid("f");
      const date = uid("f");
      return {
        fields: [
          { id: date, name: "Date", type: "date" },
          {
            id: kind, name: "Type", type: "select",
            options: [opt("run", "Run", "#c7f051"), opt("lift", "Lift", "#7fb2f0"), opt("ride", "Ride", "#e8c35a"), opt("mobility", "Mobility", "#7ee08a"), opt("other", "Other", "#8b929c")],
          },
          { id: uid("f"), name: "Minutes", type: "number" },
          { id: uid("f"), name: "Effort", type: "rating" },
          { id: uid("f"), name: "Notes", type: "longtext" },
        ],
        views: [
          { id: uid("v"), name: "Log", type: "list", sortBy: date, sortDir: "desc" },
          { id: uid("v"), name: "By type", type: "board", groupBy: kind },
        ],
        records: [],
      };
    },
  },
  {
    id: "meetings",
    name: "Meeting notes",
    icon: "users",
    blurb: "Who, what was decided, and what you owe afterwards.",
    build: () => {
      const date = uid("f");
      return {
        fields: [
          { id: uid("f"), name: "Subject", type: "text", primary: true },
          { id: date, name: "Date", type: "date" },
          { id: uid("f"), name: "With", type: "tags" },
          { id: uid("f"), name: "Notes", type: "longtext" },
          { id: uid("f"), name: "Decisions", type: "longtext" },
          { id: uid("f"), name: "Follow-ups sent", type: "checkbox" },
        ],
        views: [
          { id: uid("v"), name: "Recent", type: "list", sortBy: date, sortDir: "desc" },
          { id: uid("v"), name: "Table", type: "table" },
        ],
        records: [],
      };
    },
  },
  {
    id: "spend",
    name: "Spending log",
    icon: "zap",
    blurb: "What went out, on what, and whether it was worth it.",
    build: () => {
      const category = uid("f");
      const date = uid("f");
      return {
        fields: [
          { id: uid("f"), name: "Item", type: "text", primary: true },
          { id: uid("f"), name: "Amount", type: "number" },
          {
            id: category, name: "Category", type: "select",
            options: [opt("home", "Home", "#c7f051"), opt("food", "Food", "#e8c35a"), opt("transport", "Transport", "#7fb2f0"), opt("fun", "Fun", "#ef7d7d"), opt("tools", "Tools", "#7ee08a")],
          },
          { id: date, name: "Date", type: "date" },
          { id: uid("f"), name: "Worth it", type: "checkbox" },
        ],
        views: [
          { id: uid("v"), name: "Recent", type: "table", sortBy: date, sortDir: "desc" },
          { id: uid("v"), name: "By category", type: "board", groupBy: category },
        ],
        records: [],
      };
    },
  },
];

export const templateById = (id) => TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];
