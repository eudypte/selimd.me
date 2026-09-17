const FS = {
  name: "C:",
  type: "dir",
  children: [
    {
      name: "me.txt",
      type: "file",
      content: `SELIM DUZER
---------------------------------------
Aspiring software engineer.

This site is a small portfolio built to
look like an old two-pane file manager
(specifically norton commander).
Browse the tree on the left, read the
file on the right.

See [projects](projects) or get in
[touch](contact.txt).

Check out my [dotfiles](dotfiles.txt) for my development
environment and agentic coding setup.

See what I'm listening to at
[music](personal/music.txt).`,
    },
    {
      name: "projects",
      type: "dir",
      children: [
        {
          name: "basic-orbit-sim.txt",
          type: "file",
          content: `BASIC ORBIT SIM  [GitHub](https://github.com/eudypte/basic-orbit-sim)
---------------------------------------
Stack: Python, Pygame, pygame_gui,
pygame-widgets

A 2D solar system simulator. Simulates
gravitational attraction between bodies
using Newton's law of universal
gravitation, with an interactive UI for
controlling the simulation.

Sun, Earth, Mars, Mercury and Venus are
simulated with realistic masses and
orbital velocities. Click anywhere in
space to drop a custom body with a
configurable mass and initial velocity
and watch it get pulled into the
system. Zoom with the scroll wheel,
pause/resume, run at 2x speed, and
toggle individual planets on or off
from the settings panel.`,
        },
        {
          name: "aerofusion.txt",
          type: "file",
          content: `AEROFUSION  [Try it live](https://aerofusion.selimd.me)
---------------------------------------
Stack: Java 21, Spring Boot 3.4, Kafka,
Postgres with PostGIS, Angular 18,
MapLibre GL, deck.gl

A multi-source air-track fusion and
situational-awareness console. It
ingests live [ADS-B](https://en.wikipedia.org/wiki/Automatic_Dependent_Surveillance%E2%80%93Broadcast) feeds from [OpenSky](https://opensky-network.org/)
Network and adsb.lol, then correlates
reports of the same aircraft by ICAO
address.

Each track is smoothed with a
[Kalman filter](https://en.wikipedia.org/wiki/Kalman_filter). Confidence reflects how
many sources see it, report freshness,
and agreement after time-aligning
positions. Operators can draw restricted
zones and receive alerts when aircraft
enter them.

Viewing is public. Analysts sign in to
draw or edit zones, with every change
recorded in an audit trail. Roughly
7,000 concurrent aircraft render on a
GPU-instanced 3D map.`,
        },
        {
          name: "second-look.txt",
          type: "file",
          content: `SECOND LOOK  [Try it live](https://secondlook.selimd.me)  [GitHub](https://github.com/eudypte/second-look)
---------------------------------------
Stack: TypeScript, Next.js, React,
Claude Haiku 4.5, Google Safe Browsing,
Vercel

A phone-first web app for people who
are not technical, like your
grandparents. Paste a worrying text
message and get a plain-English answer
on whether it looks like a scam, with
the evidence behind it. It never opens
the link.

Code checks every link for site age via
RDAP, brand lookalikes, free hosting,
short links and Google Safe Browsing,
then sets a minimum warning. One Claude
call reads the message for pressure
tactics and explains. The AI can raise
the warning but never lower it, so a
scam claiming to be "verified safe"
cannot talk its way out.

On held-out real texts it caught 84 of
100 scams (84%) and flagged 6 of 180
genuine personal and business messages
(3.3%).`,
        },
      ],
    },
    {
      name: "personal",
      type: "dir",
      children: [
        {
          name: "music.txt",
          type: "file",
          dynamic: "spotify",
        },
      ],
    },
    {
      name: "contact.txt",
      type: "file",
      content: `CONTACT
---------------------------------------
Email:   [pselim4@outlook.com](mailto:pselim4@outlook.com)
GitHub:  [github.com/eudypte](https://github.com/eudypte)
LinkedIn: [linkedin.com/in/selimd](https://linkedin.com/in/selimd)`,
    },
    {
      name: "dotfiles.txt",
      type: "file",
      content: `DOTFILES  [GitHub](https://github.com/eudypte/dotfiles)
---------------------------------------
I like keeping my hands on the
keyboard, so my Mac is tiled with
[AeroSpace](https://github.com/nikitabobko/AeroSpace), an i3-like window manager,
with a [SketchyBar](https://github.com/FelixKratz/SketchyBar) status bar I set up
myself. The repo also has my
JankyBorders, Alacritty, tmux and zsh
config.

I have been trying to keep up with the
new agentic AI tools, and my current
setup is coding agents like [pi](https://github.com/earendil-works/pi) running
in [herdr](https://herdr.dev), a terminal workspace manager
for agent sessions, with [firstmate](https://github.com/kunchenguid/firstmate)
orchestrating several of them in
parallel on isolated copies of a repo.`,
    },
  ],
};
