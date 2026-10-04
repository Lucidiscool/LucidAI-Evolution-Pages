# LucidAI Evolution results site

Static GitHub Pages companion for the private [LucidAI Evolution](https://github.com/Lucidiscool/LucidAI-Evolution) learning lab. The page publishes measured evaluation scores for seven games. It does not publish model checkpoints, the private source, or a remote control API.

The full training dashboard runs on the Fedora host at `http://127.0.0.1:8770/`. To use it from another computer, make a trusted SSH port forward to port 8770 and open that address on the other computer. This public Pages site shows the saved results without needing the host online.

Every JSON file in `data/` was copied from the lab's `reports/` directory on 2026-10-03. Scores are game scores from 50 held-out evaluation episodes, not training rewards. See the lab's `reports/README.md` for interpretation and limits.
