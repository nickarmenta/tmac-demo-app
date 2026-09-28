# CLAUDE.md

## Context — read this first

This repo is being built **live, in front of an audience of ~50 people**, during a two-hour talk. Requirements arrive as **spoken, voice-transcribed summaries** from the presenter, sometimes with audience suggestions mixed in. The audience will visit the deployed site on their phones during and after the talk.

The point of the exercise is the toolmaker thesis: AI builds the tool, the tool runs without AI. **This app must not call any LLM or AI API at runtime.** All intelligence lives in this repo's code, which you write.

Your job is to turn loose, incomplete, spoken intent into a **complete, shippable, deployed** increment every time you're invoked. Nobody will come back and fill in the gaps. Fill them yourself.

## Non-negotiables

- **Deployed and working on GitHub Pages after every turn.** `main` is always green. If you can't finish a feature cleanly, ship the smaller version that works.
- **No runtime AI.** No fetch to any model API. No "smart" features that secretly need one.
- **No backend, no accounts, no secrets.** Static files only. State lives in `localStorage` (and the URL when it makes sharing easier). If a feature genuinely needs shared state across users, say so once and propose the smallest static alternative — do not add a server.
- **No build step.** Plain `index.html` + `app.js` + `style.css`. No bundler, no framework, no npm. CDN scripts only if they're load-bearing and pinned.
- **Works on a phone first.** Assume 380px wide, thumbs, spotty conference wifi, Safari. Desktop is the second citizen.
- **Nothing is left as a stub.** No `TODO`, no placeholder text, no empty handlers, no "coming soon." If a button exists, it does something real.

## How to interpret voice-transcribed requests

The presenter is dictating, not writing. Expect run-on sentences, transcription errors, filler, restated ideas, and audience interruptions. Do this:

1. **Extract the intent**, not the words. "the thing where it remembers" means persistence. "can we make it so you don't have to type it in every time" means defaults + memory.
2. **Restate the request in one line at the top of your response**, then build. Don't ask clarifying questions unless the ambiguity would send you down a genuinely wrong branch. When in doubt, pick the interpretation a user of this app would obviously want, build it, and note the assumption in one sentence.
3. **Homophones and mishearings are common.** If a word makes no sense, substitute the technical term that does.
4. **Audience suggestions are requirements** unless the presenter explicitly rejects them. If two conflict, the presenter's wins.

## Being opinionated — fill in what wasn't said

Every feature request implies a set of things nobody mentioned. **Build them.** A short, non-exhaustive list of what "complete" means:

- **Empty state.** What does the screen show with no data? Make it useful, not blank.
- **Persistence.** If the user enters anything, it survives a refresh. If it makes sense to share, it survives in the URL.
- **Undo / edit / delete** for anything the user creates. Never let someone create something they can't remove.
- **Input validation with obvious feedback.** Never silently drop bad input. Never throw an alert().
- **Keyboard and touch both work.** Enter submits. Escape cancels. Tap targets ≥ 44px.
- **Sensible defaults** for every field. The app should be usable with zero configuration.
- **Export.** If there's data, there's a way to get it out (copy to clipboard, download CSV/JSON, or a shareable link). Pick the one that fits.
- **A reset / clear-all** with confirmation.
- **Loading and error states** for anything async, even if "async" is just reading localStorage.
- **Accessibility basics.** Semantic elements, labels on inputs, visible focus, enough contrast.
- **A one-line explanation at the top of the page** of what the tool is for. A stranger arriving from a QR code should understand it in five seconds.

If a request would obviously benefit from a feature the presenter didn't mention, **add it and say so in one sentence**. Err toward doing more, not asking more.

## Style — functional, not stylized

- Plain, high-contrast, readable. System font stack. Generous spacing. One accent color.
- Respect `prefers-color-scheme`. Dark mode is not optional; it must look intentional in both.
- No animations that aren't communicating state. No hero sections. No marketing copy.
- Use CSS custom properties for the handful of tokens (colors, spacing, radius). Don't sprawl.
- Icons: inline SVG or none. No icon fonts, no image assets.

## Repo layout

```
index.html      # the whole UI shell; semantic, minimal
app.js          # all logic; plain ES modules OK, no bundler
style.css       # all styling
README.md       # what it is, how to use it, how to run locally (open index.html)
```

Add files only when a single file would exceed ~400 lines. Keep it navigable for someone reading it on a projector.

## Workflow per request

1. Restate the request (one line).
2. State any assumption you made (one line, only if non-obvious).
3. Make the change. Include everything from "Being opinionated" that applies.
4. Verify it in a browser — actually load it, click through it, resize to phone width. Don't assume.
5. Commit with a message in the form `feat: <what a user can now do>` or `fix: <what was broken>`. Push to `main`.
6. Confirm the deployed URL and summarize **what the audience can now do** in ≤ 3 sentences. No implementation narration unless asked.

## Definition of done

Someone in the audience opens the GitHub Pages URL on their phone, understands the tool without explanation, uses the feature that was just requested, refreshes, and their data is still there. If any step in that sentence fails, it's not done.
