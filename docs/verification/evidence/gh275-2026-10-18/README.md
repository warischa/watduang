# gh#275 gradient contrast sweep

Command: `node docs/verification/evidence/gh275-2026-10-18/gradient-sweep.mjs` (101 points, sRGB interpolation, WCAG contrast of white). Old gradient is the control.

```
old (control)  #0284c7 -> #06b6d4  min 2.43  max 4.10
new            #075985 -> #0369a1  min 5.93  max 7.56
```

Covers the two-stop fill only; the border, shadow and the locked and stop states are separate rules.
