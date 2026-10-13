# Terminal font

JetBrainsMono Nerd Font Mono, regular and bold, from Nerd Fonts v3.4.0:

- https://github.com/ryanoasis/nerd-fonts/tree/v3.4.0/patched-fonts/JetBrainsMono/Ligatures/Regular
- https://github.com/ryanoasis/nerd-fonts/tree/v3.4.0/patched-fonts/JetBrainsMono/Ligatures/Bold

The TTF files were losslessly converted to WOFF2 with FontTools (`TTFont`,
`font.flavor = 'woff2'`, `font.save(...)`). No glyphs were removed. The Mono
variant keeps Nerd Font icons within terminal cells. Italics are synthesized
by the browser. The licenses are in `src/client/public/fonts/jetbrains-mono/` and are copied
into every build alongside the fonts.

The office serves these assets itself; clients need no local font installation
or third-party font service. Vite fingerprints the files for cache invalidation.
