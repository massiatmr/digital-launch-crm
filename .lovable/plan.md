

## Custom Scrollbars for Pipeline

### What
Replace the default browser scrollbars in the pipeline with custom-styled, smooth scrollbars matching the dark theme — both the horizontal container scroll and the vertical scroll within each column.

### How

**1. Add custom scrollbar CSS to `src/index.css`**
- Add WebKit scrollbar styles (`::-webkit-scrollbar`, `::-webkit-scrollbar-thumb`, `::-webkit-scrollbar-track`) for a utility class `.custom-scrollbar`
- Thin scrollbar (6px), rounded thumb using `hsl(var(--border))` color, transparent track, hover glow effect
- Add `scroll-behavior: smooth` and Firefox `scrollbar-width: thin` + `scrollbar-color`

**2. Apply to `PipelinePage.tsx`**
- Add `.custom-scrollbar` class to the horizontal pipeline container (line 271)
- Add `.custom-scrollbar` class to each column's vertical scroll area (in `PipelineColumn`, the `overflow-y-auto` div)

### Result
Sleek, thin scrollbars with smooth scrolling that match the dark UI theme, on both axes.

