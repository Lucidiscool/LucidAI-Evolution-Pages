# LucidAI Evolution results site

Static GitHub Pages companion for the private [LucidAI Evolution](https://github.com/Lucidiscool/LucidAI-Evolution) learning lab. The page publishes measured evaluation scores for seven games and links to a remote dashboard. It does not publish model checkpoints or the private source.

The full training dashboard runs on the Fedora host at `http://127.0.0.1:8770/`. The `/lab/` page connects through the existing LucidAI tunnel and requires the existing LucidAI admin passcode. The passcode is never stored on GitHub Pages or in the browser; the short-lived admin token stays in page memory. The public results page works without the host online.

Every JSON file in `data/` was copied from the lab's `reports/` directory on 2026-10-03. Scores are game scores from 50 held-out evaluation episodes, not training rewards. See the lab's `reports/README.md` for interpretation and limits.
