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
          name: "project-one.txt",
          type: "file",
          content: `PROJECT ONE
---------------------------------------
description.

Stack: FILL
Link: raaa`,
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
Email:   pselim4@outlook.com
GitHub:  github.com/eudypte
LinkedIn: linkedin.com/in/selimd`,
    },
  ],
};
