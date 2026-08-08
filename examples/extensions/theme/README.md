# Theme Extension

This is a complete declarative theme extension. Copy this folder into a
workspace's `.axon/extensions/` directory or the user extension directory shown
by Axon's Extensions view, then refresh extensions.

The manifest contributes the theme picker entry. The referenced theme file owns
UI, Monaco, syntax, and terminal colors. Axon fills any omitted optional tokens
from its theme fallback, but a real theme should define the major surfaces and
syntax groups shown here so editor and workbench contrast remain intentional.
