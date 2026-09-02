# Shannon's Mind Reader

[中文](./README.md) · **English**

> The machine has already placed its bet. Your turn to fool it.

A browser game where eight relay memory cells chase you down.

[Play it now →](https://shoot5313.github.io/shannon-mind-reader-1953/)

[![Gameplay: the lighthouse says whether the machine is sure, you pick a lane, then the beam reveals its bet](./assets/gameplay.gif)](https://shoot5313.github.io/shannon-mind-reader-1953/)

No sign-in, works offline. Your callsign, your choices and your result cards never leave the browser.

## It starts in 1953

On 18 March 1953, Claude Shannon wrote a four-page memorandum at Bell Labs titled *A Mind-Reading (?) Machine*.

The first line hands the credit to his colleague David W. Hagelbarger: Shannon's is a simplified version of Hagelbarger's machine. No neural network, no idea who you are. Just eight relay memory cells, playing the same left-or-right game with a person over and over, writing down what just happened one cell at a time.

The question mark in the title is honest. Of course it does not read minds. It just remembers patterns more patiently than a person does.

The rule that makes the whole thing work: **the machine has to bet first.** Every guess is sealed before you press left or right, and both are revealed together afterwards. When it catches you, it did not change its answer after the fact. When you fool it, you really did fool it.

We put that machine in a browser and gave it a strait with a searchlight, a treasure map, and a slightly obnoxious "Shannon-Certified Smart Egg."

[![The 1953 Bell Labs archive lobby: a green relay mind-reading machine](./assets/readme-hero.png)](https://shoot5313.github.io/shannon-mind-reader-1953/)

## Go take that treasure map

Three lamps, one hundred nautical miles of the Shannon Strait.

- The first 10 miles are calm. The machine only watches.
- After that the sea turns. Pick left or right at each fork; three consecutive catches by the searchlight put out one lamp.
- From mile 80 a storm tightens the rule: two consecutive catches are now enough. The machine says so when you get there.
- Reach the end with at least one lamp and the map is yours. The more lamps you keep, the rarer the find.

Read the lighthouse before you move. Lit means the machine recognises the situation you are in and has an opinion. Dark means it is guessing. The lamp reports only how sure it is, never which side it bet. That stays sealed until after you move.

What makes the lamp light up is something you taught it. So how to use the lamp is not written here: that is the second game.

For the first 10 miles the lamp is mostly dark, because the machine genuinely has not seen any situation yet. Nothing can cost you there, which makes it the place to learn to read it.

When a run ends, the machine lays out what it read: how often you switched after two moves on the same side, how many times it checked, what the p-value was. It says so when it caught a habit, and says so just as plainly when it did not. If the sample was too thin, it refuses to conclude anything at all.

You also get two labels. An egg says how the run turned out. A behavioural title says how you played it.

The title looks at four things: whether you stay or switch, whether the lamp changes your play, whether being caught changes you, and whether you favour one side. What the card prints are this run's real figures. "You stayed 62% of the time" is simply what happened across those hands, and needs no test to be true. The ones that also survive a significance test get an extra "verified" seal.

So everyone gets a title, and the seal has to be earned. Someone whose four numbers all come out flat as a coin toss is a Nobody.

The two go on separate cards: the egg card is the outcome, the title card is the evidence.

## The eight-cell research room

You can go straight at the machine from the `CASE 8` staff entrance in the lobby; a run's result page also leaves an unfiled record behind. The research file runs eight banks of eight hands. Ahead is a `100% Smart Egg`, level is a `100% Ordinary Egg`, behind is a `100% Dumb Egg`. Each cell shows a live `×N` visit count; across 64 hands the first two set up the situation, so the remaining 62 lookups draw this run's own eight-cell footprint. There is one more unsigned file sealed inside the machine, and its trigger is not written here.

64 hands is not a number from Shannon's memorandum. The original machine could be played forever. In the research room every hand asks you to read eight cells and second-guess the machine, which is far more work per hand than sailing, so it is folded into `8 × 8`: enough to feel like research, not long enough to become an endurance test. The voyage is 100 miles.

The result also tells you which of the eight cells read you most easily. That is your own transparency, not what the cell remembered.

## Eight cells, sixteen bits

<details>
<summary>What is actually stored (play a run first)</summary>

Each of the eight cells corresponds to one recent situation, indexed by `[won/lost] · [stayed/switched] · [won/lost]`. Each cell keeps two bits:

- your reaction in that situation, stay or switch
- whether that reaction has repeated, because the memorandum only lets the machine trust something it has seen twice

Eight cells at two bits each is 16 bits of memory in total. The interface shows you exactly half: which cell is open, whether it is armed, how many times you have been there. The remembered direction stays sealed.

The searchlight in the voyage leaks the same half, one cell at a time: it tells you the machine is armed, never which way.

No decoding table is published here, and no counter-strategy: studying the machine is the second game.

</details>

## Run it locally

The whole game is ordinary HTML, CSS and JavaScript, with the icons and the algorithm in the repository. No build step, no runtime dependencies, and it keeps working offline.

```bash
git clone https://github.com/shoot5313/shannon-mind-reader-1953.git
cd shannon-mind-reader-1953
npm run serve
```

Open `http://localhost:4173/`. Opening `index.html` directly works too.

Run the tests:

```bash
npm test
```

<details>
<summary>Where to read the code</summary>

- `src/engine.js` — the eight-cell Shannon predictor, the habit tests, scoring and titles
- `src/unified-entry.js` — the 1953 lobby, the callsign, the way in
- `src/two-mode-prototype.js` — the strait chase, the research room, the result cards
- `tests/` — sealed-before-the-choice, eight-cell learning, hidden-file boundaries, and the calibration bands
- `experiments/tune-adventure.cjs` — difficulty calibration. Run it before changing the voyage length or an achievement threshold
- [DESIGN.md](./DESIGN.md) — how this machine was tuned: what was tried, what was cut, where every number came from

</details>

## Sources

- Claude E. Shannon, [*A Mind-Reading (?) Machine*](https://this1that1whatever.com/miscellany/mind-reader/Shannon-Mind-Reading.pdf), Bell Laboratories, 18 March 1953. Reprinted in *Claude Elwood Shannon: Collected Papers*, ed. N. J. A. Sloane and Aaron D. Wyner, pp. 688–690.
- D. W. Hagelbarger, [*SEER, A SEquence Extrapolating Robot*](https://doi.org/10.1109/TEC.1956.5219783), *IRE Transactions on Electronic Computers*, EC-5(1), 1956, pp. 1–7.
- N. J. A. Sloane, [Claude Shannon bibliography](https://neilsloane.com/doc/shannonbib.html) — item 73 is the 1953 typescript.

The memorandum is short. Play first, then read it.

## License

[MIT](./LICENSE) · © 2026 shoot5313
