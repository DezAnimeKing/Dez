import { h } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { router } from "../router.js";
import { showMenu } from "../ui/menu.js";
import { emptyState, ring, progressBar } from "../ui/controls.js";
import { openNewProject, openProjectSettings, openCategoryManager } from "../ui/dialogs.js";
import { projectProgress, tasksForProject, isDone, overdueTasks } from "../store/selectors.js";
import { updateProject } from "../store/actions.js";
import { relativeTime } from "../lib/date.js";

function projectCard(state, project) {
  const progress = projectProgress(state, project.id);
  const tasks = tasksForProject(state, project.id);
  const open = tasks.filter((task) => !isDone(state, task));
  const overdue = open.filter((task) => task.due && task.due < new Date().toISOString().slice(0, 10)).length;
  const category = state.categories.find((c) => c.id === project.categoryId);

  return h(
    "a",
    { class: "gcard", href: `#/projects/${project.id}`, style: { padding: "16px", gap: "12px" } },
    h(
      "div", { class: "u-row" },
      h("span", { class: "nav-item__swatch", style: { background: project.color, width: "10px", height: "10px" } }),
      h("span", { class: "gcard__title u-grow u-truncate" }, project.name),
      project.favorite ? icon("star", 14) : null,
      h(
        "button",
        {
          class: "btn btn--ghost btn--icon btn--sm", "aria-label": `${project.name} options`,
          onClick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            showMenu(event.currentTarget, [
              { label: "Open board", icon: "board", onClick: () => router.navigate(`#/projects/${project.id}`) },
              { label: "Settings", icon: "settings", onClick: () => openProjectSettings(project.id) },
              { label: project.favorite ? "Remove favourite" : "Add to favourites", icon: "star", onClick: () => updateProject(project.id, { favorite: !project.favorite }) },
              { label: project.archived ? "Unarchive" : "Archive", icon: "archive", onClick: () => updateProject(project.id, { archived: !project.archived }) },
            ], { align: "end" });
          },
        },
        icon("more-v", 15)
      )
    ),
    project.description ? h("p", { class: "gcard__meta u-clamp-2", style: { lineHeight: "1.5" } }, project.description) : null,
    h(
      "div", { class: "u-row", style: { gap: "12px", marginTop: "auto" } },
      ring(progress.pct, { size: 42, stroke: 4 }),
      h(
        "div", { class: "u-col u-grow", style: { gap: "5px" } },
        h("div", { class: "gcard__meta" },
          h("span", null, `${open.length} open`),
          h("span", null, "·"),
          h("span", null, `${progress.done} done`),
          overdue ? h("span", { class: "chip chip--overdue" }, `${overdue} late`) : null),
        progressBar(progress.pct, { thin: true, color: project.color })
      )
    ),
    h(
      "div", { class: "gcard__meta" },
      category ? h("span", { class: "chip" }, category.name) : null,
      project.archived ? h("span", { class: "chip" }, "Archived") : null,
      h("span", { class: "u-dim" }, `Created ${relativeTime(project.createdAt)}`)
    )
  );
}

export function projectsView({ state, route }) {
  const categoryId = route.query.category || null;
  const showArchived = route.query.archived === "1";

  let projects = state.projects.filter((project) => (showArchived ? project.archived : !project.archived));
  if (categoryId) projects = projects.filter((project) => (categoryId === "none" ? !project.categoryId : project.categoryId === categoryId));

  const favourites = projects.filter((p) => p.favorite);
  const rest = projects.filter((p) => !p.favorite);

  const body = h(
    "div", { class: "view__inner" },
    h(
      "div", { class: "filterbar" },
      h(
        "button",
        {
          class: ["btn", "btn--sm", categoryId && "btn--primary"].filter(Boolean).join(" "),
          onClick: (event) => showMenu(event.currentTarget, [
            { label: "All categories", icon: "grid", active: !categoryId, onClick: () => router.setQuery({ category: null }) },
            { label: "Uncategorised", icon: "folder", active: categoryId === "none", onClick: () => router.setQuery({ category: "none" }) },
            { separator: true },
            ...state.categories.map((category) => ({
              label: category.name, icon: "folder", active: categoryId === category.id,
              onClick: () => router.setQuery({ category: category.id }),
            })),
            { separator: true },
            { label: "Manage categories…", icon: "settings", onClick: () => openCategoryManager() },
          ]),
        },
        icon("folder", 14),
        categoryId ? state.categories.find((c) => c.id === categoryId)?.name || "Uncategorised" : "All categories"
      ),
      h(
        "button",
        { class: ["btn", "btn--sm", showArchived && "btn--primary"].filter(Boolean).join(" "), onClick: () => router.setQuery({ archived: showArchived ? null : "1" }) },
        icon("archive", 14), showArchived ? "Showing archived" : "Archived"
      ),
      h("div", { class: "u-grow" })
    ),
    projects.length
      ? h(
          "div", { class: "u-col", style: { gap: "18px" } },
          favourites.length
            ? h("div", null,
                h("div", { class: "group-head", style: { paddingLeft: 0 } }, "Favourites"),
                h("div", { class: "gallery" }, ...favourites.map((project) => projectCard(state, project))))
            : null,
          h("div", null,
            favourites.length ? h("div", { class: "group-head", style: { paddingLeft: 0 } }, "All projects") : null,
            h("div", { class: "gallery" }, ...rest.map((project) => projectCard(state, project))))
        )
      : emptyState({
          icon: "board",
          title: showArchived ? "No archived projects" : "No projects yet",
          text: "Projects hold a board of tasks — one per area of work.",
          action: h("button", { class: "btn btn--primary btn--sm", onClick: () => openNewProject() }, icon("plus", 14), "New project"),
        })
  );

  return {
    topbar: {
      crumbs: [{ label: "Dezk", href: "#/today" }, { label: "Projects" }],
      title: "Projects",
      subtitle: `${projects.length} project${projects.length === 1 ? "" : "s"} · ${overdueTasks(state).length} tasks past their date`,
      tools: [h("button", { class: "btn btn--primary btn--sm", onClick: () => openNewProject() }, icon("plus", 14), "New project")],
    },
    body,
  };
}
