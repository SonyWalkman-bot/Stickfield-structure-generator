# Contributing to Weavefield

Thanks for helping. Weavefield is small enough to read in an afternoon, and most changes touch one or two files.

## Before you start

- Read [CLAUDE.md](CLAUDE.md). It covers how the code is laid out, the design data, the physics and the conventions,
  whether you are a person or a coding agent.
- For anything bigger than a fix, open an issue first saying what you want to change and why, so work doesn't
  collide.

## Making a change

1. Fork the repository, or make a branch if you have access.
2. Keep each pull request to one change someone can review in one sitting.
3. Check it:

   ```bash
   npm run build && npm test     # always
   npm run test:smoke            # if anything visible changed (then look at test/out/*.png)
   npm run test:offline          # if building, saving or loading changed
   ```

4. Open a pull request. The template asks what changes for someone using Weavefield, and how you checked it.
   Screenshots help for anything visible.

## What makes a change easy to accept

- **It keeps both builds working.** The published page and the offline copy come from the same source; the offline copy
  must keep working with no internet, opened from a file.
- **Physics changes come with evidence.** `test/t_phys.js` compares the solver with beam theory. If a number moves, say
  why, and add a test for anything new.
- **Words a user reads are plain and say what to do.** Follow the wording conventions in CLAUDE.md.
- **Colours come from the design tokens** in `src/template.html`, in light and dark versions, not from new hard-coded
  values.
- **No new runtime dependencies and no build step.** Plain JavaScript, loaded in order by `build.js`.

## Agents contributing

Coding agents are welcome contributors. Point yours at CLAUDE.md. It should:

- run the checks above before opening a pull request
- describe what changed in a user's terms
- say plainly anything it couldn't check (for example, a browser it couldn't open)

## Reporting a problem

Open an issue with:

- what you did
- what you expected, and what happened instead
- your browser and computer

Attach the design file if you can (Files → Design file).
