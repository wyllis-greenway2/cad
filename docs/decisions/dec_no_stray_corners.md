---
id: dec_no_stray_corners
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_332, in_333, in_334
date: 2026-11-14
depends_on:
  - prin_history_additive: the rule makes an old history delete a corner that is already gone, so deleting what is not there must be harmless or the file stops replaying
---
# A drawn corner exists only while something is drawn on it, and the command layer keeps that rule

**The rule.** A drawn corner is shown only as the end of a line, the end or the middle of an arc, or the middle of a circle. A corner that none of those stands on is not there for the person drawing, so it must not exist to be snapped to, lined up with or offered a constraint. `deletePart` and `deleteParts` (`operation/commands.ts`, `strandedCorners`) therefore take, with the parts asked for and everything built on them, the corners that stood under them and are left with nothing on them. It is kept in that one place: a delete, a trim and the deleting of a surface (`in_285`) all take parts away through those two commands, whatever refs they name, so none of them has to remember it (the trim's own cleanup was removed).

**What stays.** A corner that a step names (a move, turn or scale of it) or a repeat repeats; a corner the sketch derives (a crossing). A piece cut from a line (`derived`) does not stand on a corner: it goes with its line, and counting it as something else standing there was the fault of `in_332`. Only corners that stood under what is going are looked at, so a corner made in the same command batch before anything stands on it is not taken.

**Old histories.** A history made before the rule has later commands that delete such a corner by name. Deleting parts that are already gone, all of them or some, is therefore not an error (it was only for some). A file made before the rule loses its stray corners when it is replayed; it is not changed on disk until saved. The drawing as it is worked on (`live`, `operation/ownership.ts`) also leaves out a corner with nothing on it, for a scene that has one anyway (made by hand, or kept because a step names it): the second line of defence.

**Not done.** The delete action (`interaction/actions.ts`) still lists the own corners of a line or circle, only so that a move, turn or scale step that names one is taken out with it before the command runs (the command layer must not drop a step); a corner a step names is kept by the rule.

## Rationale

The human asked (`in_332`) why the cursor lined up with points that were not there, and, after the cause was found to be a cleanup that each path had to remember (`in_333`), approved the rule in one place (`in_334`). A rule kept in each tool is kept wrongly by whichever forgets or misjudges (here: the check that counted derived pieces as users, in three places); kept in the command layer it holds for every way parts go, and for the next tool.
