---
cssclasses:
  - after-hours
---
![[banner-after-hours.svg|banner]]

# Tasks

> [!terminal] How to write a task (anywhere in the vault)
> `- [ ] Pitch deck to Sam 📅 2026-10-02 ⏫ #business #important [person:: Sam] [start:: 09:00] [end:: 10:30]`
> priority: 🔺 urgent · ⏫ high · 🔼 medium · 🔽 low — status: [ ] todo · [/] in progress · [x] done · [-] cancelled
> tasks in a daily note default to that day. Everything with a date syncs to Excel ▸ Variable Tasks.

> [!grid]
> > [!card|red] 🔥 Overdue
> > ```tasks
> > not done
> > happens before today
> > sort by happens
> > short mode
> > ```
>
> > [!card|pink] 🌙 Today
> > ```tasks
> > not done
> > happens today
> > sort by priority
> > short mode
> > ```
>
> > [!card|teal] 📻 Next 7 days
> > ```tasks
> > not done
> > happens after today
> > happens before in 8 days
> > sort by happens
> > group by happens
> > short mode
> > ```

## Eisenhower matrix
> [!grid]
> > [!card|red] Do first — urgent & important
> > ```tasks
> > not done
> > (priority is highest) OR (priority is high)
> > tags include #important
> > short mode
> > ```
>
> > [!card|teal] Schedule — important
> > ```tasks
> > not done
> > (priority is medium) OR (priority is low) OR (priority is none)
> > tags include #important
> > short mode
> > ```
>
> > [!card|amber] Delegate — urgent
> > ```tasks
> > not done
> > (priority is highest) OR (priority is high)
> > tags do not include #important
> > short mode
> > ```
>
> > [!card|violet] Delete — neither
> > ```tasks
> > not done
> > (priority is medium) OR (priority is low) OR (priority is none)
> > tags do not include #important
> > short mode
> > ```

## By category
```tasks
not done
group by tags
sort by due
short mode
```

## Recently done
```tasks
done after 14 days ago
sort by done reverse
limit 20
short mode
```

See also: [[Task Inbox]] · [[Excel Agenda]] (recurring tasks coming from Excel)
