const FS = {
  name: "C:",
  type: "dir",
  children: [
    {
      name: "me.txt",
      type: "file",
      content: `SELIM DUZER
---------------------------------------
Software engineer.

This site is a small portfolio built to
look like an old two-pane file manager (specifically norton commander).
Browse the tree on the left, read the
file on the right.

See [projects](projects) or get in
[touch](contact.txt).`,
    },
    {
      name: "projects",
      type: "dir",
      children: [
        {
          name: "basic-orbit-sim.txt",
          type: "file",
          content: `BASIC ORBIT SIM
---------------------------------------
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
from the settings panel.

Stack: Python, Pygame, pygame_gui,
pygame-widgets

[View on GitHub](https://github.com/eudypte/basic-orbit-sim)`,
        },
        {
          name: "project-two.txt",
          type: "file",
          content: `PROJECT TWO
---------------------------------------
description.

Stack: stackk
Link: sdlfkjhds`,
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
  ],
};
